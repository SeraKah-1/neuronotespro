
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Download, Copy, Eye, Check, List, Book, Focus, Save, Edit3, CloudUpload, Clipboard, ClipboardCheck, EyeOff, MousePointerClick, BookOpen, Microscope, Activity, AlertTriangle, Info, Wand2, Search, X, HelpCircle, MessageSquareQuote, LayoutTemplate, Undo2, Redo2, Loader2, Workflow, Printer, FileDown, Maximize2, Minimize2, UploadCloud, ArrowLeft, StickyNote } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { processGeneratedNote } from '../utils/formatter';
import { refineNoteContent, generateAssistantResponse } from '../services/geminiService';
import { refineNoteContentGroq, generateAssistantResponseGroq } from '../services/groqService';
import Mermaid from './Mermaid';
import AssistantPanel from './AssistantPanel';
import { AppTheme, AIProvider, GenerationConfig, UploadedFile, GEMINI_MODELS_LIST, AppModel, ChatMessage, StickyNote as StickyNoteType } from '../types';

// Helper for file conversion
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

interface OutputDisplayProps {
  content: string;
  topic: string;
  noteId?: string;
  config: GenerationConfig;
  onUpdateContent?: (newContent: string) => void;
  onManualSave?: (content: string) => void;
  onExit: () => void;
  theme?: AppTheme;
  groqModels?: {value: string, label: string, badge: string}[];
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

const OutputDisplay: React.FC<OutputDisplayProps> = ({ content, topic, onUpdateContent, onManualSave, onExit, noteId, config, theme = AppTheme.CLINICAL_CLEAN, groqModels = [] }) => {
  const [history, setHistory] = useState<string[]>([content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [editableContent, setEditableContent] = useState(content);
  const debouncedContent = useDebounce(editableContent, 500); 

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [showToc, setShowToc] = useState(false);
  const [activeHeaderId, setActiveHeaderId] = useState<string>('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const [sensorMode, setSensorMode] = useState(false);

  const [showMagicEdit, setShowMagicEdit] = useState(false);
  const [magicInstruction, setMagicInstruction] = useState('');
  const [magicProvider, setMagicProvider] = useState<AIProvider>(config.provider);
  const [magicModel, setMagicModel] = useState<string>(config.model);
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const [showDiagramsModal, setShowDiagramsModal] = useState(false);
  const [extractedDiagrams, setExtractedDiagrams] = useState<string[]>([]);

  // --- ASSISTANT & GHOST STATE ---
  const [aiProposal, setAiProposal] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [currentNoteMetadata, setCurrentNoteMetadata] = useState<any>(null);
  const [stickies, setStickies] = useState<StickyNoteType[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'assistant' | 'stickies'>('assistant');

  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { 
      setEditableContent(content); 
      setHistory([content]);
      setHistoryIndex(0);
      setIsDirty(false); 
      
      // Fetch Metadata for Assistant
      if (noteId) {
          const notes = StorageService.getInstance().getLocalNotesMetadata();
          const note = notes.find(n => n.id === noteId);
          if (note) {
              setCurrentNoteMetadata(note.metadata);
              if (note.metadata?.stickies) {
                  setStickies(note.metadata.stickies);
              } else {
                  setStickies([]);
              }
          }
      }
  }, [noteId]); // OPTIMIZATION: Only reset history when switching notes, not on every content update 

  // --- STICKY NOTES HANDLERS ---
  const saveStickiesToMetadata = async (newStickies: StickyNoteType[]) => {
      if (!noteId) return;
      const storage = StorageService.getInstance();
      const notes = storage.getLocalNotesMetadata();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex >= 0) {
          const updatedMetadata = {
              ...notes[noteIndex].metadata,
              stickies: newStickies
          };
          // Update local state
          setCurrentNoteMetadata(updatedMetadata);
          
          // Load full content to save safely
          const content = await storage.getNoteContent(noteId);
          const fullNote = { ...notes[noteIndex], content, metadata: updatedMetadata };
          await storage.saveNoteLocal(fullNote);
      }
  };

  const addSticky = (text: string, color: StickyNoteType['color'] = 'yellow') => {
      const newSticky: StickyNoteType = {
          id: Date.now().toString(),
          text,
          color,
          timestamp: Date.now()
      };
      const newStickies = [...stickies, newSticky];
      setStickies(newStickies);
      saveStickiesToMetadata(newStickies);
      setRightPanelTab('stickies');
  };

  const deleteSticky = (id: string) => {
      const newStickies = stickies.filter(s => s.id !== id);
      setStickies(newStickies);
      saveStickiesToMetadata(newStickies);
  }; 

  const pushToHistory = (newContent: string) => {
    if (newContent === history[historyIndex]) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setEditableContent(newContent);
    setIsDirty(true);
    if (onUpdateContent) onUpdateContent(newContent);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setEditableContent(history[newIndex]);
      if (onUpdateContent) onUpdateContent(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setEditableContent(history[newIndex]);
      if (onUpdateContent) onUpdateContent(history[newIndex]);
    }
  };

  const toc = useMemo(() => {
    const lines = debouncedContent.split('\n');
    const headers: TocItem[] = [];
    let counter = 0;
    lines.forEach(line => {
      const cleanLine = line.replace(/^>\s*\[!.*?\]\s*/, '').replace(/^>\s*/, '');
      const match = cleanLine.match(/^(#{1,3})\s+(.+)$/);
      if (match) headers.push({ id: `header-${counter++}`, text: match[2].trim(), level: match[1].length });
    });
    return headers;
  }, [debouncedContent]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollPosition = scrollRef.current.scrollTop + 150;
    const headers = toc.map(t => document.getElementById(t.id));
    let currentActive = '';
    for (const header of headers) {
        if (header && header.offsetTop < scrollPosition) { currentActive = header.id; }
    }
    if (currentActive !== activeHeaderId) setActiveHeaderId(currentActive);
  }, [toc, activeHeaderId]);

  const scrollToHeader = (id: string) => { const element = document.getElementById(id); if (element) { element.scrollIntoView({ behavior: 'smooth' }); setActiveHeaderId(id); } };

  const handleManualSaveTrigger = async () => { 
      if (onManualSave) { 
          setIsSaving(true);
          try {
            await new Promise(r => setTimeout(r, 600));
            if(isMounted.current) {
                onManualSave(editableContent); 
                setIsDirty(false); 
                setIsSaving(false);
                setJustSaved(true);
                setTimeout(() => { if(isMounted.current) setJustSaved(false); }, 2000);
            }
          } catch (e) {
            console.error("Save Error:", e);
            setIsSaving(false);
            alert("Failed to save note.");
          }
      } 
  };
  
  // --- PDF EXPORT (Improved Strategy: DOM Expansion + Style Injection + Responsive SVG Fix) ---
  const handleExportPdf = async () => {
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
      
      // FIX: Fallback to new ID if noteId is undefined (newly generated notes)
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
              _status: 'synced' // Optimistic status
          };

          setIsSaving(true);
          try {
              // 1. Ensure it exists locally first (generates the ID in IDB)
              await storage.saveNoteLocal(note as any);
              
              // 2. Upload to Cloud
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

  const executeMagicEdit = async () => {
      if (!magicInstruction) return;
      setIsMagicLoading(true);
      try {
          let newContent = '';
          const tempConfig = { ...config, provider: magicProvider, model: magicModel };
          if (magicProvider === AIProvider.GEMINI) { newContent = await refineNoteContent(tempConfig, editableContent, magicInstruction); } 
          else { newContent = await refineNoteContentGroq(tempConfig, editableContent, magicInstruction); }
          if(isMounted.current) { pushToHistory(newContent); setShowMagicEdit(false); setMagicInstruction(''); }
      } catch (e: any) { alert("Magic Edit Failed: " + e.message); } 
      finally { if(isMounted.current) setIsMagicLoading(false); }
  };

  const extractMermaidDiagrams = useCallback(() => {
      const regex = /```mermaid([\s\S]*?)```/g;
      const matches = [];
      let match;
      while ((match = regex.exec(editableContent)) !== null) {
          matches.push(match[1].trim());
      }
      setExtractedDiagrams(matches);
      setShowDiagramsModal(true);
  }, [editableContent]);

  // --- ASSISTANT HANDLERS ---
  const handleAssistantPrompt = async (history: ChatMessage[], files: File[], provider?: AIProvider, model?: string): Promise<string> => {
      setIsAiProcessing(true);
      try {
          const uploadedFiles: UploadedFile[] = await Promise.all(files.map(async f => ({
              name: f.name,
              mimeType: f.type,
              data: await fileToBase64(f)
          })));

          let response = '';
          // Use override if provided, else fallback to config
          const activeProvider = provider || config.provider;
          const activeModel = model || config.model;
          const tempConfig = { ...config, provider: activeProvider, model: activeModel };

          if (activeProvider === AIProvider.GEMINI) {
              response = await generateAssistantResponse(tempConfig, editableContent, history, uploadedFiles);
          } else {
              response = await generateAssistantResponseGroq(tempConfig, editableContent, history, uploadedFiles);
          }

          // CHECK FOR STICKY COMMANDS
          // Format: {{STICKY: text}} or {{STICKY|color: text}}
          const stickyRegex = /\{\{STICKY(?:\|(\w+))?:(.*?)\}\}/g;
          let match;
          let hasSticky = false;
          while ((match = stickyRegex.exec(response)) !== null) {
              hasSticky = true;
              const color = (match[1] as any) || 'yellow';
              const text = match[2].trim();
              addSticky(text, color);
          }
          
          // Remove sticky commands from response to show clean text
          response = response.replace(stickyRegex, '').trim();
          
          if (hasSticky && !response) {
              response = "I've added a sticky note for you.";
          }

          return response;
      } catch (e: any) {
          alert("Assistant Error: " + e.message);
          throw e;
      } finally {
          if (isMounted.current) setIsAiProcessing(false);
      }
  };

  const handleApplyProposal = () => {
      if (!aiProposal) return;
      const newContent = editableContent + "\n\n" + aiProposal;
      pushToHistory(newContent);
      setAiProposal(null);
  };

  const handleDiscardProposal = () => {
      setAiProposal(null);
  };

  // --- SYNC MERMAID EDITS TO MARKDOWN ---
  const handleMermaidChange = useCallback((oldCode: string, newCode: string) => {
      setEditableContent(current => {
          if (current.includes(oldCode)) {
              // Replace the specific diagram block content
              const updated = current.replace(oldCode, newCode);
              return updated;
          }
          return current;
      });
      setIsDirty(true);
  }, []);

  // --- RENDERERS ---
  const CodeBlock = useCallback(({ node, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const isMermaid = match && match[1] === 'mermaid';
    const content = String(children).replace(/\n$/, '');

    if (isMermaid) {
        return ( 
            <SensorBlock active={sensorMode} label="Reveal Diagram"> 
                <div className="mermaid-container">
                    <Mermaid 
                        chart={content} 
                        key={content} // Important: Force re-render if content changes externally
                        onChartChange={(newCode) => handleMermaidChange(content, newCode)} 
                    />
                </div>
            </SensorBlock> 
        );
    }
    if (!match) return <code className="bg-[var(--md-code-bg)] px-1 py-0.5 rounded text-red-500 font-mono text-sm border border-[var(--md-border)]" {...props}>{children}</code>;

    return (
        <SensorBlock active={sensorMode} label="Reveal Code">
          <div className="group relative my-4 rounded-lg overflow-hidden border border-[var(--md-border)] bg-[var(--md-code-bg)] text-[var(--md-text)] shadow-sm text-sm p-4">
              <code className={`${className}`} {...props}>{children}</code>
          </div>
        </SensorBlock>
    );
  }, [sensorMode, handleMermaidChange]);

  const getHeaderId = useCallback((text: string, level: number) => { const found = toc.find(t => t.text === text && t.level === level); return found ? found.id : undefined; }, [toc]);

  const components = useMemo(() => ({
    h1: ({ children }: any) => <h1 id={getHeaderId(String(children), 1)}>{children}</h1>,
    h2: ({ children }: any) => <h2 id={getHeaderId(String(children), 2)}>{children}</h2>,
    h3: ({ children }: any) => <h3 id={getHeaderId(String(children), 3)}>{children}</h3>,
    code: CodeBlock
  }), [getHeaderId, CodeBlock]);

  return (
    <div className="h-full flex flex-col relative font-sans bg-[var(--ui-bg)]">
      
      {/* --- TOOLBAR (TOP STICKY) --- */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-[var(--ui-surface)]/95 backdrop-blur-md border-b border-[var(--ui-border)] shadow-sm">
          
          <div className="flex items-center gap-2">
              <button 
                  onClick={onExit} 
                  className="mr-2 p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] transition-colors"
                  title="Back to Workspace"
              >
                  <ArrowLeft size={18}/>
              </button>

              <div className="flex bg-[var(--ui-bg)] rounded-lg p-0.5 border border-[var(--ui-border)]">
                  <button onClick={() => setActiveTab('preview')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${activeTab === 'preview' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><BookOpen size={14}/> Read</button>
                  <button onClick={() => setActiveTab('code')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${activeTab === 'code' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><Edit3 size={14}/> Code</button>
              </div>
          </div>

          <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowToc(!showToc)} 
                className={`p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] ${showToc ? 'bg-[var(--ui-bg)] text-[var(--ui-primary)]' : ''} hidden md:block`} 
                title="Outline"
              >
                <List size={18}/>
              </button>
              
              <button 
                onClick={handleExportPdf} 
                disabled={isExportingPdf} 
                className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] hidden md:block" 
                title="PDF"
              >
                {isExportingPdf ? <Loader2 size={18} className="animate-spin"/> : <FileDown size={18}/>}
              </button>

              <button 
                onClick={extractMermaidDiagrams} 
                className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] hidden md:block" 
                title="Diagrams"
              >
                <Workflow size={18}/>
              </button>

              <button 
                onClick={() => setSensorMode(!sensorMode)} 
                className={`p-2 rounded-lg ${sensorMode ? 'bg-amber-100 text-amber-600' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)]'}`} 
                title="Sensor Mode"
              >
                <EyeOff size={18}/>
              </button>

              <button 
                onClick={() => setShowMagicEdit(!showMagicEdit)} 
                className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-indigo-500" 
                title="Magic Edit"
              >
                <Wand2 size={18}/>
              </button>

              <button 
                onClick={handleCloudUpload} 
                className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-cyan-500" 
                title="Upload Cloud"
              >
                <UploadCloud size={18}/>
              </button>
              
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

      {showMagicEdit && (
          <div className="bg-[var(--ui-surface)] border-b border-[var(--ui-border)] p-2 animate-scale-in flex flex-col gap-2">
              <div className="max-w-2xl mx-auto w-full flex items-center gap-2 justify-end px-3">
                  <select 
                      value={magicProvider} 
                      onChange={(e) => { setMagicProvider(e.target.value as AIProvider); setMagicModel(''); }}
                      className="bg-[var(--ui-bg)] text-[10px] font-bold border border-[var(--ui-border)] rounded p-1 outline-none"
                  >
                      <option value={AIProvider.GEMINI}>Gemini</option>
                      <option value={AIProvider.GROQ}>Groq</option>
                  </select>
                  <select 
                      value={magicModel} 
                      onChange={(e) => setMagicModel(e.target.value)}
                      className="bg-[var(--ui-bg)] text-[10px] font-bold border border-[var(--ui-border)] rounded p-1 outline-none max-w-[150px]"
                  >
                      {(magicProvider === AIProvider.GEMINI ? GEMINI_MODELS_LIST : groqModels).map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                  </select>
              </div>
              <div className="max-w-2xl mx-auto flex items-center gap-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg px-3 py-2 w-full">
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

      {/* --- CONTENT SCROLL AREA (SPLIT PANE) --- */}
      <div className="flex-1 flex overflow-hidden relative">
          
          {/* LEFT PANE: EDITOR (70%) */}
          <div 
            className="flex-1 overflow-y-auto custom-scrollbar relative scroll-smooth flex flex-col"
            ref={scrollRef}
            onScroll={handleScroll}
          >
             {activeTab === 'preview' && (
                 <div className="min-h-full py-10 px-4 md:px-10 flex justify-center pb-32">
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

             {/* GHOST STATE OVERLAY */}
             {aiProposal && (
                 <div className="sticky bottom-4 mx-4 md:mx-10 z-30 animate-slide-up">
                     <div className="bg-[var(--ui-surface)] border border-[var(--ui-primary)] rounded-xl shadow-2xl overflow-hidden flex flex-col">
                         <div className="bg-[var(--ui-primary)]/10 p-3 border-b border-[var(--ui-primary)]/20 flex justify-between items-center">
                             <span className="text-xs font-bold text-[var(--ui-primary)] uppercase tracking-widest flex items-center gap-2">
                                 <Wand2 size={14}/> AI Proposal
                             </span>
                             <div className="flex gap-2">
                                 <button onClick={handleDiscardProposal} className="px-3 py-1 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-colors">Discard</button>
                                 <button onClick={handleApplyProposal} className="px-3 py-1 rounded-lg text-xs font-bold bg-[var(--ui-primary)] text-white hover:opacity-90 transition-opacity">Apply</button>
                             </div>
                         </div>
                         <div className="p-4 max-h-[300px] overflow-y-auto bg-[var(--ui-bg)] text-sm prose prose-sm max-w-none">
                             <ReactMarkdown>{aiProposal}</ReactMarkdown>
                         </div>
                     </div>
                 </div>
             )}
          </div>

          {/* RIGHT PANE: ASSISTANT & STICKIES (30%) */}
          <div className="w-[30%] min-w-[320px] hidden lg:flex flex-col h-full border-l border-[var(--ui-border)] bg-[var(--ui-surface)]">
              
              {/* TABS */}
              <div className="flex border-b border-[var(--ui-border)]">
                  <button 
                      onClick={() => setRightPanelTab('assistant')}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${rightPanelTab === 'assistant' ? 'text-[var(--ui-primary)] border-b-2 border-[var(--ui-primary)] bg-[var(--ui-bg)]' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)]'}`}
                  >
                      AI Assistant
                  </button>
                  <button 
                      onClick={() => setRightPanelTab('stickies')}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${rightPanelTab === 'stickies' ? 'text-[var(--ui-primary)] border-b-2 border-[var(--ui-primary)] bg-[var(--ui-bg)]' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)]'}`}
                  >
                      Stickies ({stickies.length})
                  </button>
              </div>

              {/* CONTENT */}
              <div className="flex-1 overflow-hidden relative">
                  {rightPanelTab === 'assistant' ? (
                      <AssistantPanel 
                          noteMetadata={{ ...currentNoteMetadata, stickies }} // Pass live stickies
                          onPromptSubmit={handleAssistantPrompt}
                          isProcessing={isAiProcessing}
                          groqModels={groqModels}
                      />
                  ) : (
                      <div className="h-full flex flex-col bg-[var(--ui-bg)] p-4 overflow-y-auto custom-scrollbar space-y-4">
                          <div className="flex justify-between items-center mb-2">
                              <h3 className="text-xs font-bold text-[var(--ui-text-muted)] uppercase">Your Notes</h3>
                              <button 
                                  onClick={() => addSticky("New Note", 'yellow')}
                                  className="text-[var(--ui-primary)] hover:bg-[var(--ui-primary)]/10 p-1 rounded transition-colors"
                                  title="Add Sticky"
                              >
                                  <CloudUpload size={16} className="rotate-90"/> {/* Using CloudUpload as a 'plus' ish icon or just use text */}
                              </button>
                          </div>
                          
                          {stickies.length === 0 && (
                              <div className="text-center py-10 opacity-30 flex flex-col items-center">
                                  <StickyNote size={40} className="mb-2"/>
                                  <p className="text-xs">No stickies yet</p>
                                  <button onClick={() => addSticky("Don't forget to...", 'yellow')} className="mt-2 text-[var(--ui-primary)] text-xs hover:underline">Create one</button>
                              </div>
                          )}

                          {stickies.map((sticky) => (
                              <div 
                                  key={sticky.id} 
                                  className={`relative group p-3 rounded-lg shadow-sm border transition-transform hover:scale-[1.02] ${
                                      sticky.color === 'yellow' ? 'bg-yellow-50 border-yellow-200 text-yellow-900' :
                                      sticky.color === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-900' :
                                      sticky.color === 'green' ? 'bg-green-50 border-green-200 text-green-900' :
                                      'bg-pink-50 border-pink-200 text-pink-900'
                                  }`}
                              >
                                  <textarea 
                                      value={sticky.text}
                                      onChange={(e) => {
                                          const newStickies = stickies.map(s => s.id === sticky.id ? { ...s, text: e.target.value } : s);
                                          setStickies(newStickies);
                                          // Debounce save? For now save on blur
                                      }}
                                      onBlur={() => saveStickiesToMetadata(stickies)}
                                      className="w-full bg-transparent outline-none resize-none text-xs font-medium min-h-[60px]"
                                  />
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                      <button onClick={() => deleteSticky(sticky.id)} className="text-red-400 hover:text-red-600"><X size={12}/></button>
                                  </div>
                                  <div className="flex gap-1 mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                      {['yellow', 'blue', 'green', 'pink'].map(c => (
                                          <button 
                                              key={c}
                                              onClick={() => {
                                                  const newStickies = stickies.map(s => s.id === sticky.id ? { ...s, color: c as any } : s);
                                                  setStickies(newStickies);
                                                  saveStickiesToMetadata(newStickies);
                                              }}
                                              className={`w-3 h-3 rounded-full border border-black/10 ${
                                                  c === 'yellow' ? 'bg-yellow-300' :
                                                  c === 'blue' ? 'bg-blue-300' :
                                                  c === 'green' ? 'bg-green-300' : 'bg-pink-300'
                                              }`}
                                          />
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>

      </div>

      {showToc && activeTab === 'preview' && toc.length > 0 && (
             <div className="fixed left-4 top-32 w-56 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[var(--ui-surface)]/95 backdrop-blur border border-[var(--ui-border)] rounded-xl shadow-2xl p-4 z-40 animate-slide-up hidden xl:block">
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

      {/* DIAGRAMS MODAL */}
      {showDiagramsModal && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl">
                  <div className="p-4 border-b border-[var(--ui-border)] flex justify-between items-center bg-[var(--ui-bg)] rounded-t-2xl">
                      <h3 className="font-bold text-[var(--ui-text-main)] flex items-center gap-2"><Workflow size={16} className="text-[var(--ui-primary)]"/> Extracted Diagrams ({extractedDiagrams.length})</h3>
                      <button onClick={() => setShowDiagramsModal(false)}><X size={18} className="text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-[var(--ui-bg)]">
                      {extractedDiagrams.length === 0 ? (
                          <div className="text-center p-12 text-[var(--ui-text-muted)]">No Mermaid diagrams found in this note.</div>
                      ) : (
                          extractedDiagrams.map((code, idx) => (
                              <div key={idx} className="border border-[var(--ui-border)] rounded-xl p-4 bg-white shadow-sm">
                                  <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-widest">Diagram {idx + 1}</div>
                                  <div className="mermaid-container">
                                      <Mermaid chart={code} />
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default OutputDisplay;
