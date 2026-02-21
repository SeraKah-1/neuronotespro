import React, { useState, useEffect, Suspense } from 'react';
import { BrainCircuit, Settings2, Sparkles, BookOpen, Layers, Zap, AlertCircle, X, Key, GraduationCap, Microscope, Puzzle, Database, HardDrive, Cloud, Layout, Activity, FlaskConical, ListChecks, Bell, HelpCircle, Copy, Check, ShieldCheck, Cpu, Unlock, Download, RefreshCw, User, Lock, Server, PenTool, Wand2, ChevronRight, FileText, FolderOpen, Trash2, CheckCircle2, Circle, Command, Bot, Maximize2, Home, Projector, Minimize2, Component, Save, BookTemplate, ChevronDown, ChevronUp, MessageSquarePlus, Library, Palette, Sun, Moon, Coffee, Network, LogOut, Map, ArrowLeftFromLine, ArrowRightFromLine, Filter, Menu, PlusCircle, Paperclip } from 'lucide-react';
import { AppModel, AppState, NoteData, GenerationConfig, MODE_STRUCTURES, NoteMode, HistoryItem, AIProvider, StorageType, AppView, EncryptedPayload, SavedPrompt, AppTheme } from './types';
import { generateNoteContent, generateDetailedStructure } from './services/geminiService';
import { generateNoteContentGroq, fetchGroqModels, generateDetailedStructureGroq } from './services/groqService';
import { StorageService } from './services/storageService';
import { NotificationService } from './services/notificationService';
import FileUploader from './components/FileUploader';
import SyllabusFlow from './components/SyllabusFlow';
import LoginGate from './components/LoginGate';
import FileSystem from './components/FileSystem'; 
import NeuralVault from './components/NeuralVault';
import CommandPalette from './components/CommandPalette';
// FIX: Strict relative import
import ErrorBoundary from './components/ErrorBoundary';

// LAZY LOAD OPTIMIZATION:
const OutputDisplay = React.lazy(() => import('./components/OutputDisplay'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const KnowledgeBase = React.lazy(() => import('./components/KnowledgeBase'));

// UPDATED MODEL LIST (Based on latest available)
const GEMINI_MODELS = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro', badge: 'Flagship' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash', badge: 'Fastest' },
  { value: AppModel.GEMINI_2_5_PRO, label: 'Gemini 2.5 Pro', badge: 'Stable' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash', badge: 'Balanced' },
  { value: AppModel.GEMINI_2_5_FLASH_LITE, label: 'Gemini 2.5 Flash-Lite', badge: 'Budget' },
  { value: AppModel.DEEP_RESEARCH_PRO, label: 'Deep Research Pro', badge: 'Agentic' },
];

const INITIAL_GROQ_MODELS = [
  { value: AppModel.GROQ_LLAMA_3_3_70B, label: 'Llama 3.3 70B', badge: 'Versatile' },
  { value: AppModel.GROQ_LLAMA_3_1_8B, label: 'Llama 3.1 8B', badge: 'Instant' },
  { value: AppModel.GROQ_MIXTRAL_8X7B, label: 'Mixtral 8x7B', badge: 'Complex' },
];

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false); // Collapsible Advanced Config
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(AppTheme.CLINICAL_CLEAN);
  
  // Responsive State
  const [isLaptop, setIsLaptop] = useState(false);

  // Navigation State
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Mobile Sidebar Toggle
  
  // Context Injection State
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [contextNotesMeta, setContextNotesMeta] = useState<HistoryItem[]>([]);

  // --- RESPONSIVE LISTENER ---
  useEffect(() => {
    const checkLaptop = () => setIsLaptop(window.innerWidth >= 1024);
    checkLaptop();
    window.addEventListener('resize', checkLaptop);
    return () => window.removeEventListener('resize', checkLaptop);
  }, []);

  const [config, setConfig] = useState<GenerationConfig>({
    provider: AIProvider.GEMINI,
    model: AppModel.GEMINI_2_5_FLASH, 
    temperature: 0.4,
    apiKey: '', 
    groqApiKey: '', 
    mode: NoteMode.GENERAL,
    storageType: StorageType.LOCAL,
    supabaseUrl: '',
    supabaseKey: '',
    autoApprove: true,
    customContentPrompt: '',
    customStructurePrompt: '' 
  });

  const [noteData, setNoteData] = useState<NoteData>({
    topic: '',
    files: [],
    structure: MODE_STRUCTURES[NoteMode.GENERAL],
  });

  const [appState, setAppState] = useState<AppState>({
    isLoading: false,
    generatedContent: null,
    error: null,
    progressStep: '',
    currentView: AppView.WORKSPACE, // Default View is HOME/WORKSPACE
    activeNoteId: null
  });

  const [isStructLoading, setIsStructLoading] = useState(false);
  const [groqModels, setGroqModels] = useState<{value: string, label: string, badge: string}[]>(INITIAL_GROQ_MODELS);
  const [settingsTab, setSettingsTab] = useState<'keys' | 'storage' | 'appearance'>('keys'); 
  const [storageService] = useState(StorageService.getInstance());
  const [notificationService] = useState(NotificationService.getInstance());
  const [sqlCopied, setSqlCopied] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedPrompt[]>([]);

  // --- SESSION PERSISTENCE (AUTO LOGIN) ---
  useEffect(() => {
      const localGeminiKey = localStorage.getItem('neuro_gemini_key');
      const localGroqKey = localStorage.getItem('neuro_groq_key');
      const localSbUrl = localStorage.getItem('neuro_sb_url');
      const localSbKey = localStorage.getItem('neuro_sb_key');
      
      // Load saved preferences
      const savedProvider = localStorage.getItem('neuro_pref_provider');
      const savedModel = localStorage.getItem('neuro_pref_model');

      if (localGeminiKey || localGroqKey) {
          setConfig(prev => ({
              ...prev,
              apiKey: localGeminiKey || prev.apiKey,
              groqApiKey: localGroqKey || prev.groqApiKey,
              supabaseUrl: localSbUrl || prev.supabaseUrl,
              supabaseKey: localSbKey || prev.supabaseKey,
              provider: (savedProvider as AIProvider) || (localGeminiKey ? AIProvider.GEMINI : AIProvider.GROQ),
              model: savedModel || prev.model,
              storageType: (localSbUrl && localSbKey) ? StorageType.SUPABASE : StorageType.LOCAL
          }));
          setIsAuthenticated(true);
      }

      if (localSbUrl && localSbKey) { storageService.initSupabase(localSbUrl, localSbKey); }
      setSavedTemplates(storageService.getTemplates());
      const savedTheme = localStorage.getItem('neuro_theme');
      if (savedTheme) { setCurrentTheme(savedTheme as AppTheme); }
  }, []);

  // --- PERSIST PREFERENCES ---
  useEffect(() => {
      if (isAuthenticated) {
          localStorage.setItem('neuro_pref_provider', config.provider);
          localStorage.setItem('neuro_pref_model', config.model);
      }
  }, [config.provider, config.model, isAuthenticated]);

  // --- DYNAMIC GROQ FETCH ---
  useEffect(() => {
      const fetchGroq = async () => {
          // Fetch regardless of config key, let service handle env var fallback
          const models = await fetchGroqModels(config.groqApiKey);
          
          if (models.length > 0) {
              const formatted = models.map(m => ({
                  value: m.id,
                  label: m.id.replace('groq-', '').replace('llama', 'Llama'),
                  badge: 'Cloud'
              }));
              // Merge with defaults to keep "badge" info for core models, but update IDs if needed
              const merged: { value: string; label: string; badge: string; }[] = [...INITIAL_GROQ_MODELS];
              formatted.forEach(f => {
                  if (!merged.find(m => m.value === f.value)) merged.push(f);
              });
              setGroqModels(merged);
          }
      };
      
      // Fetch if authenticated OR if we have an env key (even if not fully authenticated yet)
      if (isAuthenticated || (import.meta as any).env?.VITE_GROQ_API_KEY) {
          fetchGroq();
      }
  }, [config.groqApiKey, isAuthenticated]);

  const handleLogout = () => {
      if(confirm("End Session? This will require the NeuroKey Card to unlock again.")) {
          localStorage.removeItem('neuro_gemini_key');
          localStorage.removeItem('neuro_groq_key');
          window.location.reload();
      }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowPalette(prev => !prev); }
      if (focusMode && e.key === 'Escape' && !showPalette) { setFocusMode(false); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setNavCollapsed(prev => !prev); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, showPalette]);

  // Handlers
  const handleAuthUnlock = (payload: EncryptedPayload) => {
    setConfig(prev => ({ 
      ...prev, 
      apiKey: payload.geminiKey || prev.apiKey, 
      groqApiKey: payload.groqKey || prev.groqApiKey, 
      supabaseUrl: payload.supabaseUrl || prev.supabaseUrl, 
      supabaseKey: payload.supabaseKey || prev.supabaseKey, 
      storageType: (payload.supabaseUrl && payload.supabaseKey) ? StorageType.SUPABASE : StorageType.LOCAL 
    }));
    
    if (payload.geminiKey) localStorage.setItem('neuro_gemini_key', payload.geminiKey);
    if (payload.groqKey) localStorage.setItem('neuro_groq_key', payload.groqKey);
    if (payload.supabaseUrl) localStorage.setItem('neuro_sb_url', payload.supabaseUrl);
    if (payload.supabaseKey) localStorage.setItem('neuro_sb_key', payload.supabaseKey);
    
    if (payload.supabaseUrl && payload.supabaseKey) { 
        storageService.initSupabase(payload.supabaseUrl, payload.supabaseKey); 
    }
    
    setIsAuthenticated(true);
    notificationService.requestPermissionManual();
  };

  const handleThemeChange = (theme: AppTheme) => { setCurrentTheme(theme); localStorage.setItem('neuro_theme', theme); };
  
  const handleSaveApiKey = (rawValue: string, type: 'gemini' | 'groq' | 'sb_url' | 'sb_key') => { 
      const key = rawValue.trim(); 
      if (type === 'gemini') { setConfig(prev => ({ ...prev, apiKey: key })); localStorage.setItem('neuro_gemini_key', key); }
      else if (type === 'groq') { setConfig(prev => ({ ...prev, groqApiKey: key })); localStorage.setItem('neuro_groq_key', key); }
      else if (type === 'sb_url') { 
        setConfig(prev => ({ ...prev, supabaseUrl: key, storageType: (key && config.supabaseKey) ? StorageType.SUPABASE : StorageType.LOCAL })); 
        localStorage.setItem('neuro_sb_url', key); 
      }
      else if (type === 'sb_key') { 
        setConfig(prev => ({ ...prev, supabaseKey: key, storageType: (config.supabaseUrl && key) ? StorageType.SUPABASE : StorageType.LOCAL })); 
        localStorage.setItem('neuro_sb_key', key); 
      }
  };

  const handleSelectNoteFromFileSystem = async (note: HistoryItem) => {
    setAppState(prev => ({ ...prev, isLoading: true }));
    try {
        const fullContent = await storageService.getNoteContent(note.id);
        setAppState(prev => ({ 
            ...prev, 
            currentView: AppView.WORKSPACE, 
            generatedContent: fullContent || note.content || "Error loading content.", 
            activeNoteId: note.id,
            isLoading: false
        })); 
        setNoteData(prev => ({...prev, topic: note.topic})); 
        setConfig(prev => ({...prev, mode: note.mode}));
        setMobileMenuOpen(false); // Close mobile menu if open
    } catch (e) {
        setAppState(prev => ({ ...prev, isLoading: false, error: "Failed to load note content." }));
    }
  };

  const handleGenerate = async () => {
    if (!noteData.topic.trim() || !noteData.structure.trim()) { setAppState(prev => ({ ...prev, error: "Topic & Structure required." })); return; }
    setAppState(prev => ({ ...prev, isLoading: true, generatedContent: null, error: null, progressStep: 'Initializing...', activeNoteId: null }));
    
    try {
      // PREPARE CONTEXT (if any)
      let filesToUpload = [...noteData.files];
      
      if (selectedContextIds.length > 0) {
          setAppState(prev => ({ ...prev, progressStep: 'Fetching Library Context...' }));
          const contextMap = await storageService.getBatchContent(selectedContextIds);
          
          // Convert context notes into virtual files for the AI
          Object.entries(contextMap).forEach(([id, content], idx) => {
             // Find metadata for filename
             const meta = contextNotesMeta.find(m => m.id === id);
             const title = meta ? meta.topic : `Context_${idx}`;
             
             filesToUpload.push({
                 name: `CONTEXT_NOTE: ${title}.md`,
                 mimeType: 'text/plain',
                 data: btoa(content as string), // Base64 encode the text content
                 isTokenized: true
             });
          });
      }

      let content = '';
      if (config.provider === AIProvider.GEMINI) { 
          content = await generateNoteContent(config, noteData.topic, noteData.structure, filesToUpload, (step) => setAppState(prev => ({ ...prev, progressStep: step }))); 
      } else { 
          content = await generateNoteContentGroq(config, noteData.topic, noteData.structure, (step) => setAppState(prev => ({ ...prev, progressStep: step }))); 
      }
      
      notificationService.send("Note Complete", `"${noteData.topic}" ready.`, "gen-complete");
      setAppState(prev => ({ ...prev, isLoading: false, generatedContent: content, error: null, progressStep: 'Complete' }));
    } catch (err: any) { setAppState(prev => ({ ...prev, isLoading: false, generatedContent: null, error: err.message, progressStep: '', })); }
  };

  // --- CONTENT HANDLERS ---
  const handleUpdateContent = (newContent: string) => {
    setAppState(prev => ({ ...prev, generatedContent: newContent }));
  };
  
  const handleExitNote = () => {
    setAppState(prev => ({
        ...prev,
        generatedContent: null,
        activeNoteId: null,
        currentView: AppView.WORKSPACE
    }));
  };

  const handleManualSave = async (content: string) => {
    const currentId = appState.activeNoteId;
    const noteToSave: HistoryItem = {
      id: currentId || Date.now().toString(),
      timestamp: Date.now(),
      topic: noteData.topic,
      mode: config.mode,
      content: content,
      provider: config.provider,
      parentId: null,
      tags: [],
      _status: 'local'
    };

    if (currentId) {
      const existingMeta = storageService.getLocalNotesMetadata().find(n => n.id === currentId);
      if (existingMeta) {
        Object.assign(noteToSave, {
          ...existingMeta,
          content: content,
          timestamp: Date.now()
        });
      }
    }

    await storageService.saveNoteLocal(noteToSave);

    if ((noteToSave._status === 'synced' || noteToSave._status === 'cloud' || storageService.isCloudReady())) {
      try {
        await storageService.uploadNoteToCloud(noteToSave);
      } catch (e) {
        console.warn("Cloud sync failed during manual save", e);
      }
    }

    if (!currentId) {
      setAppState(prev => ({ ...prev, activeNoteId: noteToSave.id }));
    }
  };

  // --- SUB-COMPONENTS ---

  const PrimaryNavButton: React.FC<{ view: AppView, icon: any, label: string }> = ({ view, icon: Icon, label }) => (
      <button 
        onClick={() => setAppState(prev => ({ ...prev, currentView: view }))}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group relative
        ${appState.currentView === view ? 'bg-[var(--ui-primary)] text-white shadow-lg shadow-[var(--ui-primary)]/30' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-sidebar-secondary)] hover:text-[var(--ui-text-main)]'}`}
      >
          <Icon size={20} />
          {/* Tooltip (Desktop Only) */}
          <div className="hidden md:block absolute left-14 bg-[var(--ui-text-main)] text-[var(--ui-bg)] text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {label}
          </div>
      </button>
  );

  const MobileNavButton: React.FC<{ view: AppView, icon: any, label: string }> = ({ view, icon: Icon, label }) => (
      <button 
        onClick={() => setAppState(prev => ({ ...prev, currentView: view }))}
        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-300 flex-1
        ${appState.currentView === view ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}`}
      >
          <Icon size={20} className={appState.currentView === view ? 'fill-[var(--ui-primary)]/20' : ''} />
          <span className="text-[9px] font-bold">{label}</span>
      </button>
  );

  // Load context options on mount
  useEffect(() => {
     const metas = storageService.getLocalNotesMetadata();
     setContextNotesMeta(metas.sort((a,b) => b.timestamp - a.timestamp));
  }, []);

  if (!isAuthenticated) { return <LoginGate onUnlock={handleAuthUnlock} />; }

  return (
    <div className={`h-[100dvh] flex font-sans overflow-hidden transition-colors duration-300 theme-${currentTheme} bg-[var(--ui-bg)] text-[var(--ui-text-main)]`}>
      
      <CommandPalette 
        isOpen={showPalette} 
        onClose={() => setShowPalette(false)}
        onNavigate={(v) => setAppState(prev => ({...prev, currentView: v}))}
        onChangeMode={(m) => setConfig(prev => ({...prev, mode: m}))}
        onChangeProvider={(p) => setConfig(prev => ({...prev, provider: p}))}
        onSelectNote={handleSelectNoteFromFileSystem}
        toggleFocusMode={() => setFocusMode(!focusMode)}
        isFocusMode={focusMode}
      />

      {/* --- 1. PRIMARY SIDEBAR (Desktop: Icon Strip, Mobile: Hidden) --- */}
      <aside className={`hidden md:flex w-[70px] h-full bg-[var(--ui-sidebar)] border-r border-[var(--ui-border)] flex-col items-center py-6 shrink-0 z-40 transition-all ${focusMode ? '-translate-x-full absolute' : 'relative'}`}>
         <div className="mb-8">
             <div className="w-10 h-10 bg-[var(--ui-primary)] rounded-xl flex items-center justify-center shadow-lg shadow-[var(--ui-primary)]/20">
                 <BrainCircuit className="text-white" size={22} />
             </div>
         </div>

         <div className="flex flex-col gap-4 flex-1">
             <PrimaryNavButton view={AppView.WORKSPACE} icon={Home} label="Workspace" />
             <PrimaryNavButton view={AppView.SYLLABUS} icon={ListChecks} label="Syllabus" />
             <PrimaryNavButton view={AppView.KNOWLEDGE} icon={Database} label="Knowledge" />
             <PrimaryNavButton view={AppView.ARCHIVE} icon={Cloud} label="Vault" />
         </div>

         <div className="flex flex-col gap-4">
             <button onClick={() => setShowAdminModal(true)} className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--ui-text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors"><ShieldCheck size={20}/></button>
             <PrimaryNavButton view={AppView.SETTINGS} icon={Settings2} label="Settings" />
         </div>
      </aside>

      {/* --- 2. SECONDARY SIDEBAR (Laptop: File Tree, Tablet/Mobile: Slide-over) --- */}
      <aside className={`
          w-[280px] h-full bg-[var(--ui-sidebar-secondary)] border-r border-[var(--ui-border)] flex flex-col transition-all duration-300 z-30
          fixed lg:relative left-0 top-0 bottom-0
          ${(focusMode || navCollapsed) ? 'lg:w-0 lg:opacity-0 lg:overflow-hidden' : 'lg:w-[280px] lg:opacity-100'}
          ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
      `}>
          <div className="p-4 flex items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-sidebar)] h-[60px] shrink-0">
              <h3 className="font-bold text-sm text-[var(--ui-text-main)] uppercase tracking-wider">Explorer</h3>
              {/* Close button for Mobile/Tablet */}
              <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"><X size={18}/></button>
              {/* Collapse button for Laptop */}
              <button onClick={() => setNavCollapsed(true)} className="hidden lg:block text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"><ArrowLeftFromLine size={16}/></button>
          </div>
          <div className="flex-1 overflow-hidden p-2">
              <FileSystem onSelectNote={handleSelectNoteFromFileSystem} activeNoteId={appState.activeNoteId} />
          </div>
      </aside>
      
      {/* Mobile/Tablet Overlay for Sidebar */}
      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setMobileMenuOpen(false)}></div>}

      {/* --- 3. MAIN CANVAS --- */}
      <main className="flex-1 relative h-full overflow-hidden flex flex-col bg-[var(--ui-bg)]">
         
         {/* MOBILE HEADER (< md) */}
         <div className="md:hidden h-14 bg-[var(--ui-sidebar)] border-b border-[var(--ui-border)] flex items-center justify-between px-4 shrink-0 z-20">
             <div className="flex items-center gap-3">
                 <button onClick={() => setMobileMenuOpen(true)} className="text-[var(--ui-text-main)]"><Menu size={20}/></button>
                 <span className="font-bold text-[var(--ui-text-main)] flex items-center gap-2"><BrainCircuit size={18} className="text-[var(--ui-primary)]"/> NeuroNote</span>
             </div>
             <button onClick={() => setShowPalette(true)} className="p-2 text-[var(--ui-text-muted)]"><Command size={18}/></button>
         </div>

         {/* TABLET HEADER / TRIGGER (md only) */}
         <div className="hidden md:flex lg:hidden h-14 border-b border-[var(--ui-border)] items-center justify-between px-4 shrink-0 bg-[var(--ui-bg)]">
             <button onClick={() => setMobileMenuOpen(true)} className="flex items-center gap-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] font-bold text-xs uppercase tracking-wider">
                 <Menu size={18}/> Explorer
             </button>
             <span className="font-bold text-[var(--ui-text-main)] flex items-center gap-2 opacity-50"><BrainCircuit size={16}/> NeuroNote</span>
         </div>

         {/* Collapsed Nav Toggle (Laptop Only) */}
         {navCollapsed && !focusMode && (
             <button onClick={() => setNavCollapsed(false)} className="hidden lg:block absolute top-4 left-4 z-50 p-2 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg shadow-sm text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]">
                 <ArrowRightFromLine size={16}/>
             </button>
         )}

         {/* Focus Mode Exit */}
         {focusMode && (
             <button onClick={() => setFocusMode(false)} className="absolute top-4 right-4 z-50 p-3 bg-[var(--ui-surface)] hover:bg-[var(--ui-border)] text-[var(--ui-text-main)] rounded-full border border-[var(--ui-border)] shadow-xl backdrop-blur-md transition-all hover:scale-110 group">
                 <Minimize2 size={20} className="group-hover:text-[var(--ui-primary)] transition-colors"/>
             </button>
         )}

         {/* --- CONTENT AREA --- */}
         <div className={`relative z-10 flex-1 flex flex-col h-full ${focusMode ? 'px-[5%] md:px-[15%] pt-10' : 'p-4 md:p-8'} overflow-hidden pb-24 md:pb-8`}>
             
             {/* Header (Hidden in Zen Mode & Mobile when content active) */}
             {!focusMode && appState.currentView === AppView.WORKSPACE && !appState.generatedContent && (
                 <div className="flex justify-between items-start mb-8 shrink-0 animate-fade-in">
                     <div>
                         <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--ui-text-main)] tracking-tight">
                             Workspace
                         </h2>
                         <p className="text-[var(--ui-text-muted)] text-sm mt-1 font-medium hidden md:block">
                             Medical Knowledge Generator
                         </p>
                     </div>
                     <button onClick={() => setShowPalette(true)} className="hidden md:flex items-center gap-2 px-4 py-2 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-full text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:border-[var(--ui-primary)] transition-all shadow-sm">
                         <Command size={12}/> <span className="font-mono">Cmd+K</span>
                     </button>
                 </div>
             )}

             {/* LOADING */}
             {appState.isLoading && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--ui-bg)] z-50">
                     <div className="w-16 h-16 border-4 border-[var(--ui-border)] rounded-full border-t-[var(--ui-primary)] animate-spin mb-4"></div>
                     <p className="text-[var(--ui-text-muted)] text-sm animate-pulse">{appState.progressStep || 'Processing...'}</p>
                 </div>
             )}

             {/* ERROR */}
             {appState.error && (
                 <div className="mb-6 bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl flex items-start space-x-3 animate-fade-in">
                     <AlertCircle size={20}/>
                     <span>{appState.error}</span>
                 </div>
             )}

             {/* VIEW ROUTING */}
             <div className="flex-1 overflow-y-auto custom-scrollbar h-full relative">
                 
                 {appState.currentView === AppView.ARCHIVE && <NeuralVault onSelectNote={handleSelectNoteFromFileSystem} onImportCloud={handleSelectNoteFromFileSystem} />}
                 
                 {appState.currentView === AppView.KNOWLEDGE && (
                     <div className="h-full flex flex-col border border-[var(--ui-border)] rounded-2xl bg-[var(--ui-surface)] overflow-hidden shadow-sm">
                         <Suspense fallback={<div>Loading...</div>}><KnowledgeBase /></Suspense>
                     </div>
                 )}

                 {appState.currentView === AppView.SYLLABUS && <SyllabusFlow config={config} onSelectTopic={(t) => { setNoteData(prev => ({...prev, topic: t})); setAppState(prev => ({...prev, currentView: AppView.WORKSPACE})); }} />}

                 {appState.currentView === AppView.SETTINGS && (
                     /* SETTINGS PANEL */
                     <div className="max-w-2xl mx-auto space-y-6 animate-slide-up pb-20">
                         <h2 className="text-xl font-bold text-[var(--ui-text-main)] border-b border-[var(--ui-border)] pb-2">Configuration</h2>
                         
                         {/* API Keys */}
                         <div className="bg-[var(--ui-surface)] p-6 rounded-2xl border border-[var(--ui-border)] shadow-sm space-y-4">
                             <h3 className="font-bold text-sm text-[var(--ui-text-main)] flex items-center gap-2"><Key size={16}/> API Credentials</h3>
                             <div className="space-y-3">
                                 <div>
                                     <label className="text-xs font-bold text-[var(--ui-text-muted)]">Gemini API Key</label>
                                     <input type="password" value={config.apiKey} onChange={e => handleSaveApiKey(e.target.value, 'gemini')} className="w-full mt-1 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] text-xs" />
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-[var(--ui-text-muted)]">Groq API Key</label>
                                     <input type="password" value={config.groqApiKey} onChange={e => handleSaveApiKey(e.target.value, 'groq')} className="w-full mt-1 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] text-xs" />
                                 </div>
                             </div>
                         </div>

                         {/* Cloud Storage (Supabase) */}
                         <div className="bg-[var(--ui-surface)] p-6 rounded-2xl border border-[var(--ui-border)] shadow-sm space-y-4">
                            <h3 className="font-bold text-sm text-[var(--ui-text-main)] flex items-center gap-2">
                                <Database size={16}/> Cloud Storage (Supabase)
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-[var(--ui-text-muted)]">Project URL</label>
                                    <input type="text" value={config.supabaseUrl || ''} onChange={e => handleSaveApiKey(e.target.value, 'sb_url')} className="w-full mt-1 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] text-xs" placeholder="https://xyz.supabase.co" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--ui-text-muted)]">Anon Key</label>
                                    <input type="password" value={config.supabaseKey || ''} onChange={e => handleSaveApiKey(e.target.value, 'sb_key')} className="w-full mt-1 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] text-xs" />
                                </div>
                                <div className="flex items-center gap-2 pt-2">
                                     <div className={`w-2 h-2 rounded-full ${storageService.isCloudReady() ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                     <span className="text-xs text-[var(--ui-text-muted)]">{storageService.isCloudReady() ? 'Connected' : 'Disconnected'}</span>
                                     {!storageService.isCloudReady() && config.supabaseUrl && config.supabaseKey && (
                                         <button onClick={() => storageService.initSupabase(config.supabaseUrl!, config.supabaseKey!)} className="ml-auto text-xs bg-[var(--ui-primary)] text-white px-3 py-1 rounded">Connect</button>
                                     )}
                                </div>
                            </div>
                        </div>

                         {/* Theme */}
                         <div className="bg-[var(--ui-surface)] p-6 rounded-2xl border border-[var(--ui-border)] shadow-sm space-y-4">
                             <h3 className="font-bold text-sm text-[var(--ui-text-main)] flex items-center gap-2"><Palette size={16}/> Visual Theme</h3>
                             <div className="grid grid-cols-3 gap-3">
                                 {[AppTheme.CLINICAL_CLEAN, AppTheme.ACADEMIC_PAPER, AppTheme.SEPIA_FOCUS].map(t => (
                                     <button key={t} onClick={() => handleThemeChange(t)} className={`p-3 rounded-xl border text-xs font-bold capitalize ${currentTheme === t ? 'border-[var(--ui-primary)] bg-[var(--ui-primary)]/5 text-[var(--ui-primary)]' : 'border-[var(--ui-border)] hover:bg-[var(--ui-bg)]'}`}>
                                         {t.replace('_', ' ')}
                                     </button>
                                 ))}
                             </div>
                         </div>
                     </div>
                 )}

                 {appState.currentView === AppView.WORKSPACE && !appState.generatedContent && (
                     <div className={`mx-auto h-full flex flex-col justify-center animate-slide-up pb-20 transition-all ${isLaptop ? 'max-w-7xl px-12 grid grid-cols-12 gap-16 items-center' : 'max-w-5xl px-4'}`}>
                         
                         {/* LEFT COLUMN: INPUT */}
                         <div className={`${isLaptop ? 'col-span-7' : 'w-full'}`}>
                             {/* HERO INPUT SECTION */}
                             <div className={`text-center mb-8 md:mb-10 ${isLaptop ? 'text-left' : ''}`}>
                                 <div className={`w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-6 ${isLaptop ? '' : 'mx-auto'}`}>
                                     <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-white"/>
                                 </div>
                                 <h1 className="text-2xl md:text-4xl font-extrabold text-[var(--ui-text-main)] mb-2">What shall we learn today?</h1>
                                 <p className="text-[var(--ui-text-muted)] text-sm md:text-base">Enter a medical topic to generate a comprehensive study module.</p>
                             </div>

                             <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] p-2 rounded-2xl shadow-xl shadow-[var(--ui-shadow)] w-full flex flex-col gap-2 transition-all">
                                 <div className="flex flex-col md:flex-row md:items-center gap-2">
                                     <div className="hidden md:block pl-4 text-[var(--ui-text-muted)]"><Layers size={20}/></div>
                                     <input 
                                         type="text" 
                                         value={noteData.topic} 
                                         onChange={(e) => setNoteData({...noteData, topic: e.target.value})}
                                         placeholder="e.g. Heart Failure..."
                                         className="flex-1 bg-transparent p-4 text-lg outline-none text-[var(--ui-text-main)] placeholder:text-gray-300 font-medium"
                                         autoFocus
                                     />
                                     <div className="flex items-center gap-2 px-2 pb-2 md:pb-0 justify-end">
                                         <button 
                                            onClick={() => setConfig(prev => ({...prev, provider: prev.provider === AIProvider.GEMINI ? AIProvider.GROQ : AIProvider.GEMINI}))}
                                            className="text-[10px] font-bold px-2 py-1 rounded border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"
                                            title="Switch Provider"
                                         >
                                             {config.provider.toUpperCase()}
                                         </button>
                                         <button onClick={handleGenerate} className="bg-[var(--ui-primary)] hover:opacity-90 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-bold transition-all flex items-center gap-2 text-sm md:text-base">
                                             Generate <ArrowRightFromLine size={16}/>
                                         </button>
                                     </div>
                                 </div>

                                 {/* COLLAPSIBLE ADVANCED CONTROL */}
                                 <div className="w-full px-2">
                                     <button 
                                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                        className="flex items-center gap-1 text-[10px] font-bold text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors mb-2 ml-1"
                                     >
                                         <Settings2 size={10}/> {showAdvancedOptions ? 'Hide Advanced' : 'Advanced'} {showAdvancedOptions ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
                                     </button>
                                     
                                     {showAdvancedOptions && (
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[var(--ui-bg)] rounded-xl border border-[var(--ui-border)] animate-slide-up">
                                             <div className="space-y-2">
                                                 <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase flex items-center gap-2"><Component size={12}/> Custom Blueprint Instruction</label>
                                                 <textarea 
                                                    value={config.customStructurePrompt}
                                                    onChange={(e) => setConfig({...config, customStructurePrompt: e.target.value})}
                                                    className="w-full h-20 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg p-3 text-xs text-[var(--ui-text-main)] outline-none resize-none focus:border-[var(--ui-primary)]"
                                                    placeholder="Optional: Define how the syllabus/outline should be structured..."
                                                 />
                                             </div>
                                             <div className="space-y-2">
                                                 <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase flex items-center gap-2"><PenTool size={12}/> Custom Content Instruction</label>
                                                 <textarea 
                                                    value={config.customContentPrompt}
                                                    onChange={(e) => setConfig({...config, customContentPrompt: e.target.value})}
                                                    className="w-full h-20 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg p-3 text-xs text-[var(--ui-text-main)] outline-none resize-none focus:border-[var(--ui-primary)]"
                                                    placeholder="Optional: Specific instructions for the writing style, language, or depth..."
                                                 />
                                             </div>
                                         </div>
                                     )}
                                 </div>
                             </div>

                             {/* Quick Options */}
                             <div className={`flex flex-col md:flex-row mt-6 gap-4 ${isLaptop ? 'justify-start' : 'justify-center px-4'}`}>
                                 <div className="flex items-center gap-2 px-4 py-2 bg-[var(--ui-surface)] rounded-full border border-[var(--ui-border)] w-full md:w-auto">
                                     <span className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Model</span>
                                     <select 
                                        value={config.model}
                                        onChange={(e) => setConfig({...config, model: e.target.value})}
                                        className="bg-transparent text-xs font-bold text-[var(--ui-text-main)] outline-none cursor-pointer flex-1 md:flex-none"
                                     >
                                         {config.provider === AIProvider.GEMINI ? GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : groqModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                     </select>
                                 </div>
                                 
                                 <div className="flex items-center gap-2 px-4 py-2 bg-[var(--ui-surface)] rounded-full border border-[var(--ui-border)] w-full md:w-auto">
                                     <span className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Mode</span>
                                     <select 
                                        value={config.mode}
                                        onChange={(e) => { const m = e.target.value as NoteMode; setConfig({...config, mode: m}); setNoteData({...noteData, structure: MODE_STRUCTURES[m]}); }}
                                        className="bg-transparent text-xs font-bold text-[var(--ui-text-main)] outline-none cursor-pointer flex-1 md:flex-none"
                                     >
                                         <option value={NoteMode.GENERAL}>General</option>
                                         <option value={NoteMode.COMPREHENSIVE}>Textbook</option>
                                         <option value={NoteMode.CHEAT_CODES}>Cheat Sheet</option>
                                     </select>
                                 </div>
                             </div>
                             
                             <div className={`mt-8 w-full flex flex-col gap-4 ${isLaptop ? '' : 'max-w-2xl mx-auto px-4'}`}>
                                 <div className="flex items-center justify-between text-[10px] font-bold text-[var(--ui-text-muted)] uppercase tracking-widest px-1">
                                     <span>Context & Files</span>
                                     <button onClick={() => setShowContextPicker(true)} className="flex items-center gap-1 hover:text-[var(--ui-primary)] transition-colors">
                                         <Paperclip size={10}/> Add Library Context ({selectedContextIds.length})
                                     </button>
                                 </div>
                                 <FileUploader files={noteData.files} onFilesChange={(f) => setNoteData({...noteData, files: f})} />
                             </div>
                         </div>

                         {/* RIGHT COLUMN: TEMPLATES (Laptop Only) */}
                         {isLaptop && (
                             <div className="col-span-5 space-y-6 pl-8 border-l border-[var(--ui-border)]">
                                 <div className="flex items-center gap-2 text-[var(--ui-text-muted)] font-bold text-xs uppercase tracking-widest mb-4">
                                     <BookTemplate size={14}/> Quick Start Templates
                                 </div>
                                 <div className="grid grid-cols-1 gap-3">
                                     {[
                                         { title: "Clinical Case Study", desc: "Generate a patient scenario with differential diagnosis.", icon: Activity, mode: NoteMode.CLINICAL },
                                         { title: "Exam Cheat Sheet", desc: "High-yield facts for rapid review.", icon: Zap, mode: NoteMode.CHEAT_CODES },
                                         { title: "Research Summary", desc: "Summarize papers and findings.", icon: Microscope, mode: NoteMode.GENERAL },
                                         { title: "Anatomy Deep Dive", desc: "Detailed structural analysis.", icon: Layers, mode: NoteMode.COMPREHENSIVE }
                                     ].map((t, i) => (
                                         <button 
                                            key={i}
                                            onClick={() => { setNoteData({...noteData, topic: t.title}); setConfig({...config, mode: t.mode}); }}
                                            className="group p-4 bg-[var(--ui-surface)] hover:bg-[var(--ui-bg)] border border-[var(--ui-border)] hover:border-[var(--ui-primary)] rounded-xl text-left transition-all hover:shadow-lg hover:-translate-y-1"
                                         >
                                             <div className="flex items-center gap-3 mb-1">
                                                 <div className="p-2 bg-[var(--ui-bg)] rounded-lg text-[var(--ui-primary)] group-hover:bg-[var(--ui-primary)] group-hover:text-white transition-colors">
                                                     <t.icon size={16}/>
                                                 </div>
                                                 <span className="font-bold text-[var(--ui-text-main)]">{t.title}</span>
                                             </div>
                                             <p className="text-xs text-[var(--ui-text-muted)] pl-[42px]">{t.desc}</p>
                                         </button>
                                     ))}
                                 </div>
                                 
                                 {/* Recent Activity Mini */}
                                 <div className="mt-8">
                                     <div className="flex items-center gap-2 text-[var(--ui-text-muted)] font-bold text-xs uppercase tracking-widest mb-4">
                                         <RefreshCw size={14}/> Recent Activity
                                     </div>
                                     <div className="space-y-2">
                                         {storageService.getLocalNotesMetadata().slice(0, 3).map(note => (
                                             <div key={note.id} onClick={() => handleSelectNoteFromFileSystem(note)} className="flex items-center justify-between p-3 bg-[var(--ui-bg)] hover:bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg cursor-pointer transition-colors group">
                                                 <span className="text-xs font-medium text-[var(--ui-text-main)] truncate">{note.topic}</span>
                                                 <ArrowRightFromLine size={12} className="opacity-0 group-hover:opacity-100 text-[var(--ui-text-muted)]"/>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             </div>
                         )}
                     </div>
                 )}

                 {/* RESULT DISPLAY */}
                 {appState.generatedContent && !appState.isLoading && (
                     <div className="flex h-full overflow-hidden">
                        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isLaptop && !focusMode ? 'border-r border-[var(--ui-border)]' : ''}`}>
                             <Suspense fallback={<div>Loading...</div>}>
                                 <OutputDisplay 
                                    content={appState.generatedContent} 
                                    topic={noteData.topic} 
                                    noteId={appState.activeNoteId || undefined}
                                    config={config} 
                                    onUpdateContent={handleUpdateContent}
                                    onManualSave={handleManualSave}
                                    onExit={handleExitNote}
                                    theme={currentTheme} 
                                 />
                             </Suspense>
                        </div>
                        
                        {/* LAPTOP RIGHT PANEL (Context & Tools) */}
                        {isLaptop && !focusMode && (
                            <div className="w-[320px] shrink-0 bg-[var(--ui-sidebar-secondary)] flex flex-col border-l border-[var(--ui-border)] animate-slide-left">
                                <div className="p-4 border-b border-[var(--ui-border)] flex items-center justify-between bg-[var(--ui-surface)]">
                                    <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--ui-text-muted)] flex items-center gap-2">
                                        <Sparkles size={14} className="text-[var(--ui-primary)]"/> Assistant Context
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                                    
                                    {/* Active Configuration */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Current Model</label>
                                        <div className="p-2 bg-[var(--ui-bg)] rounded border border-[var(--ui-border)] text-xs font-mono flex items-center justify-between">
                                            <span>{config.model}</span>
                                            <div className={`w-2 h-2 rounded-full ${config.provider === AIProvider.GEMINI ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Quick Actions</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => setShowContextPicker(true)} className="p-2 bg-[var(--ui-surface)] hover:bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded text-xs text-left flex items-center gap-2 transition-colors">
                                                <Paperclip size={14}/> Add Context
                                            </button>
                                            <button onClick={() => setConfig(prev => ({...prev, mode: prev.mode === NoteMode.GENERAL ? NoteMode.COMPREHENSIVE : NoteMode.GENERAL}))} className="p-2 bg-[var(--ui-surface)] hover:bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded text-xs text-left flex items-center gap-2 transition-colors">
                                                <Zap size={14}/> {config.mode === NoteMode.GENERAL ? 'Deepen' : 'Simplify'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Mini Syllabus / Related */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase">Session History</label>
                                        <div className="space-y-1">
                                            {storageService.getLocalNotesMetadata().slice(0, 5).map(note => (
                                                <div key={note.id} onClick={() => handleSelectNoteFromFileSystem(note)} className="p-2 hover:bg-[var(--ui-surface)] rounded cursor-pointer text-xs truncate border border-transparent hover:border-[var(--ui-border)] transition-all">
                                                    {note.topic}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                 )}

             </div>
         </div>
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION --- */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--ui-surface)] border-t border-[var(--ui-border)] h-[60px] flex items-center justify-between px-4 z-[60] pb-safe">
          <MobileNavButton view={AppView.WORKSPACE} icon={Home} label="Home" />
          <MobileNavButton view={AppView.SYLLABUS} icon={ListChecks} label="Syllabus" />
          <MobileNavButton view={AppView.KNOWLEDGE} icon={Database} label="Library" />
          <MobileNavButton view={AppView.ARCHIVE} icon={Cloud} label="Vault" />
          <MobileNavButton view={AppView.SETTINGS} icon={Settings2} label="Settings" />
      </div>

      {showAdminModal && <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"><div className="bg-[var(--ui-sidebar)] border border-[var(--ui-border)] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[85vh]"><Suspense fallback={<div>Loading Forge...</div>}><AdminPanel onClose={() => setShowAdminModal(false)} defaultMode="create" /></Suspense></div></div>}

      {/* LIBRARY CONTEXT PICKER MODAL */}
      {showContextPicker && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-2xl w-full max-w-lg h-[70vh] flex flex-col shadow-2xl">
                  <div className="p-4 border-b border-[var(--ui-border)] flex justify-between items-center bg-[var(--ui-bg)] rounded-t-2xl">
                      <h3 className="font-bold text-[var(--ui-text-main)] flex items-center gap-2"><Paperclip size={16} className="text-[var(--ui-primary)]"/> Select Library Context</h3>
                      <button onClick={() => setShowContextPicker(false)}><X size={18} className="text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                      {contextNotesMeta.length === 0 ? (
                          <div className="text-center p-8 text-[var(--ui-text-muted)] text-sm">Library is empty. Generate notes first.</div>
                      ) : (
                          contextNotesMeta.map(note => (
                              <div 
                                key={note.id} 
                                onClick={() => setSelectedContextIds(prev => prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id])}
                                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${selectedContextIds.includes(note.id) ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)]' : 'bg-[var(--ui-bg)] border-[var(--ui-border)] hover:bg-[var(--ui-surface)]'}`}
                              >
                                  <div className="flex items-center gap-3">
                                      <FileText size={14} className={selectedContextIds.includes(note.id) ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}/>
                                      <div>
                                          <div className={`text-sm font-medium ${selectedContextIds.includes(note.id) ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-main)]'}`}>{note.topic}</div>
                                          <div className="text-[10px] text-[var(--ui-text-muted)]">{new Date(note.timestamp).toLocaleDateString()}</div>
                                      </div>
                                  </div>
                                  {selectedContextIds.includes(note.id) && <CheckCircle2 size={16} className="text-[var(--ui-primary)]"/>}
                              </div>
                          ))
                      )}
                  </div>
                  <div className="p-4 border-t border-[var(--ui-border)] bg-[var(--ui-bg)] rounded-b-2xl flex justify-between items-center">
                      <span className="text-xs text-[var(--ui-text-muted)]">{selectedContextIds.length} Selected</span>
                      <button onClick={() => setShowContextPicker(false)} className="px-4 py-2 bg-[var(--ui-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90">Confirm Selection</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
}

export default App;