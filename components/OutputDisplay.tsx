
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Download, Copy, Eye, Check, List, Book, Focus, Save, Edit3, CloudUpload, Clipboard, ClipboardCheck, EyeOff, MousePointerClick, BookOpen, Microscope, Activity, AlertTriangle, Info, Wand2, Search, X, HelpCircle, MessageSquareQuote, LayoutTemplate, Undo2, Redo2, Loader2, Workflow, Printer, FileDown, Maximize2, Minimize2, UploadCloud, ArrowLeft } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { processGeneratedNote } from '../utils/formatter';
import { refineNoteContent } from '../services/geminiService';
import { refineNoteContentGroq } from '../services/groqService';
import Mermaid from './Mermaid';
import { AppTheme, AIProvider, GenerationConfig } from '../types';

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

  // --- DIAGRAM GALLERY STATE ---
  const [diagrams, setDiagrams] = useState<{ id: string; code: string; title: string; index: number }[]>([]);

  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { 
      setEditableContent(content); 
      setHistory([content]);
      setHistoryIndex(0);
      setIsDirty(false); 
  }, [noteId]); 

  // --- EXTRACT DIAGRAMS ---
  useEffect(() => {
      if (activeTab === 'diagrams') {
          const lines = debouncedContent.split('\n');
          const foundDiagrams: { id: string; code: string; title: string; index: number }[] = [];
          let currentTitle = 'Untitled Diagram';
          let insideBlock = false;
          let blockStart = 0;
          let blockContent: string[] = [];

          lines.forEach((line, i) => {
              // Track headings for context
              const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
              if (headingMatch) {
                  currentTitle = headingMatch[2].trim();
              }

              // Detect Mermaid Block
              if (line.trim().startsWith('```mermaid')) {
                  insideBlock = true;
                  blockStart = i;
                  blockContent = [];
              } else if (line.trim().startsWith('```') && insideBlock) {
                  insideBlock = false;
                  foundDiagrams.push({
                      id: `diag-${foundDiagrams.length}`,
                      code: blockContent.join('\n'),
                      title: currentTitle,
                      index: blockStart // Store line index for potential updates
                  });
              } else if (insideBlock) {
                  blockContent.push(line);
              }
          });
          setDiagrams(foundDiagrams);
      }
  }, [debouncedContent, activeTab]);

  const handleDiagramUpdate = (index: number, newCode: string, newTitle: string) => {
      // 1. Update the specific diagram in the content
      // We need a robust way to replace. Since we have the original code, we can try replacing that block.
      // However, duplicate diagrams are tricky.
      // Better approach: Reconstruct the content string carefully or use a unique marker if possible.
      
      // Simple approach for now: Find the *exact* block occurrence. 
      // Limitation: If there are identical blocks, it might replace the first one.
      // Improvement: Use the `index` we captured to locate the block in the line array.
      
      const lines = editableContent.split('\n');
      const diag = diagrams[index];
      
      // Update Title (Heading) - Search backwards from block start
      let titleUpdated = false;
      if (diag.title !== newTitle) {
          for (let i = diag.index - 1; i >= 0; i--) {
              if (lines[i].match(/^(#{1,6})\s+(.+)$/)) {
                  lines[i] = lines[i].replace(diag.title, newTitle);
                  titleUpdated = true;
                  break;
              }
          }
          // If no heading found above, maybe insert one? (Skip for now to be safe)
      }

      // Update Code
      if (diag.code !== newCode) {
          let codeLineIndex = diag.index + 1; // Start after ```mermaid
          const newLines = newCode.split('\n');
          
          // Remove old lines until ```
          while (lines[codeLineIndex] && !lines[codeLineIndex].trim().startsWith('```')) {
              lines.splice(codeLineIndex, 1);
          }
          
          // Insert new lines
          lines.splice(codeLineIndex, 0, ...newLines);
      }

      const newContent = lines.join('\n');
      setEditableContent(newContent);
      setIsDirty(true);
      pushToHistory(newContent);
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
          if (config.provider === AIProvider.GEMINI) { newContent = await refineNoteContent(config, editableContent, magicInstruction); } 
          else { newContent = await refineNoteContentGroq(config, editableContent, magicInstruction); }
          if(isMounted.current) { pushToHistory(newContent); setShowMagicEdit(false); setMagicInstruction(''); }
      } catch (e: any) { alert("Magic Edit Failed: " + e.message); } 
      finally { if(isMounted.current) setIsMagicLoading(false); }
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
                  <button onClick={() => setActiveTab('diagrams')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${activeTab === 'diagrams' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><Workflow size={14}/> Diagrams</button>
              </div>
          </div>

          <div className="flex items-center gap-2">
              <button onClick={() => setShowToc(!showToc)} className={`p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] ${showToc ? 'bg-[var(--ui-bg)] text-[var(--ui-primary)]' : ''} hidden md:block`} title="Outline"><List size={18}/></button>
              <button 
                onClick={handleExportPdf} 
                disabled={isExportingPdf} 
                className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)]" 
                title="PDF"
              >
                {isExportingPdf ? (
                  <Loader2 size={18} className="animate-spin"/>
                ) : (
                  <FileDown size={18}/>
                )}
              </button>
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
    </div>
  );
};

export default OutputDisplay;
