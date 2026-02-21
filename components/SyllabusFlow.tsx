
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, FileText, CheckCircle, Circle, Play, RefreshCw, Trash2, ListChecks, ArrowRight, FolderOpen, Save, Type, Edit2, Archive, Zap, PauseCircle, StopCircle, Layout, AlertCircle, CheckCircle2, Loader2, BookOpen, Settings2, Eye, ShieldAlert, GripVertical, ChevronDown, ChevronUp, Split, Cpu, Sparkles } from 'lucide-react';
import { SyllabusItem, UploadedFile, GenerationConfig, SavedQueue, AIProvider, AppModel } from '../types';
import FileUploader from './FileUploader';
import { parseSyllabusToTopics, parseSyllabusFromText } from '../services/geminiService';
import { parseSyllabusFromTextGroq } from '../services/groqService';
import { StorageService } from '../services/storageService';
import { QueueService } from '../services/queueService';

interface SyllabusFlowProps {
  config: GenerationConfig;
  onSelectTopic: (topic: string) => void;
}

const GEMINI_MODELS = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash' },
];

const GROQ_MODELS = [
  { value: AppModel.GROQ_LLAMA_3_3_70B, label: 'Llama 3.3 70B' },
  { value: AppModel.GROQ_LLAMA_3_1_8B, label: 'Llama 3.1 8B (Fast)' },
  { value: AppModel.GROQ_MIXTRAL_8X7B, label: 'Mixtral 8x7B' },
];

type TabMode = 'upload' | 'text' | 'library';

const SyllabusFlow: React.FC<SyllabusFlowProps> = ({ config, onSelectTopic }) => {
  const [syllabusFile, setSyllabusFile] = useState<UploadedFile[]>([]);
  const [rawText, setRawText] = useState('');
  
  // Queue state
  const [queue, setQueue] = useState<SyllabusItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [circuitStatus, setCircuitStatus] = useState<string | null>(null);
  
  const [queueName, setQueueName] = useState('My Curriculum');
  const [queueId, setQueueId] = useState<string | null>(null);
  
  // UX State
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('library');
  const [autoApprove, setAutoApprove] = useState(true); 
  
  // Advanced Config State (Dual Engine)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchConfig, setBatchConfig] = useState<{
      structureProvider: AIProvider | null;
      structureModel: string;
      customStructurePrompt: string;
      customContentPrompt: string;
  }>({
      structureProvider: null,
      structureModel: '',
      customStructurePrompt: '',
      customContentPrompt: ''
  });

  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [viewingItem, setViewingItem] = useState<SyllabusItem | null>(null);
  const [editedStructure, setEditedStructure] = useState('');

  const [savedQueues, setSavedQueues] = useState<SavedQueue[]>([]);
  const [storageService] = useState(StorageService.getInstance());
  const [queueService] = useState(QueueService.getInstance());

  // Responsive State
  const [isLaptop, setIsLaptop] = useState(false);
  useEffect(() => {
    const checkLaptop = () => setIsLaptop(window.innerWidth >= 1024);
    checkLaptop();
    window.addEventListener('resize', checkLaptop);
    return () => window.removeEventListener('resize', checkLaptop);
  }, []);

  useEffect(() => {
    const savedMeta = localStorage.getItem('neuro_syllabus_meta');
    if (savedMeta) {
      const meta = JSON.parse(savedMeta);
      setQueueName(meta.name);
      setQueueId(meta.id);
    }
    const savedQueue = localStorage.getItem('neuro_syllabus_queue');
    if (savedQueue) {
       const parsed = JSON.parse(savedQueue);
       setQueue(parsed);
       queueService.setQueue(parsed);
    }
    // Load saved prompt config
    const savedPrompts = localStorage.getItem('neuro_batch_config');
    if (savedPrompts) {
        setBatchConfig(JSON.parse(savedPrompts));
    }

    loadLibrary();
    const unsubscribe = queueService.subscribe((updatedQueue, processing, cStatus) => {
       setQueue(updatedQueue);
       setIsProcessing(processing);
       setCircuitStatus(cStatus || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('neuro_syllabus_meta', JSON.stringify({ id: queueId, name: queueName }));
  }, [queueName, queueId]);

  const loadLibrary = async () => {
    const queues = await storageService.getQueues();
    setSavedQueues(queues);
    const savedQueue = localStorage.getItem('neuro_syllabus_queue');
    if (queues.length === 0 && (!savedQueue || JSON.parse(savedQueue).length === 0)) {
        setActiveTab('upload');
    }
  };

  const handleSavePrompts = () => {
      localStorage.setItem('neuro_batch_config', JSON.stringify(batchConfig));
      alert("Custom Prompts Saved!");
  };

  const handleParse = async () => {
    setError(null);
    setIsParsing(true);
    try {
      let topics: SyllabusItem[] = [];
      const currentProvider = config.provider;

      if (activeTab === 'upload') {
        if (syllabusFile.length === 0) throw new Error("Please upload a file.");
        if (currentProvider === AIProvider.GEMINI) {
            topics = await parseSyllabusToTopics(config, syllabusFile[0]);
        } else if (currentProvider === AIProvider.GROQ) {
            const file = syllabusFile[0];
            if (file.mimeType.includes('text') || file.name.match(/\.(md|txt|json)$/i)) {
                const decoded = atob(file.data);
                topics = await parseSyllabusFromTextGroq(config, decoded);
            } else {
                throw new Error("Groq currently supports text-based files for parsing. Use Gemini for PDF/Images.");
            }
        }
        setSyllabusFile([]);
      } else if (activeTab === 'text') {
        if (!rawText.trim()) throw new Error("Please enter syllabus text.");
        if (currentProvider === AIProvider.GEMINI) {
            topics = await parseSyllabusFromText(config, rawText);
        } else {
            topics = await parseSyllabusFromTextGroq(config, rawText);
        }
        setRawText('');
      }
      setQueue(topics);
      queueService.setQueue(topics);
      setQueueId(Date.now().toString());
      setQueueName("New Curriculum");
    } catch (e: any) { setError(e.message); } finally { setIsParsing(false); }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => { setDraggedItemIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => { e.preventDefault(); if (draggedItemIndex === null || draggedItemIndex === dropIndex) return; const newQueue = [...queue]; const [movedItem] = newQueue.splice(draggedItemIndex, 1); newQueue.splice(dropIndex, 0, movedItem); setQueue(newQueue); queueService.setQueue(newQueue); setDraggedItemIndex(null); };

  const handleStartBatch = () => {
     const runConfig: GenerationConfig = { 
         ...config, 
         autoApprove,
         structureProvider: batchConfig.structureProvider || undefined,
         structureModel: batchConfig.structureModel || undefined,
         customStructurePrompt: batchConfig.customStructurePrompt || undefined,
         customContentPrompt: batchConfig.customContentPrompt || undefined
     };
     if (circuitStatus && circuitStatus.includes("CIRCUIT")) { queueService.resetCircuit(); }
     queueService.startProcessing(runConfig);
  };
  const handleStopBatch = () => { queueService.stop(); };
  const openReview = (item: SyllabusItem) => { setViewingItem(item); setEditedStructure(item.structure || "# Generating Structure..."); };
  const handleApprove = () => { if (viewingItem) { queueService.updateItemStructure(viewingItem.id, editedStructure); setViewingItem(null); } };

  const handleSaveToLibrary = async () => { if (queue.length === 0) return; const idToSave = queueId || Date.now().toString(); const newQueue: SavedQueue = { id: idToSave, name: queueName, items: queue, timestamp: Date.now() }; await storageService.saveQueue(newQueue); setQueueId(idToSave); await loadLibrary(); alert("Saved to Library!"); };
  const handleLoadFromLibrary = (saved: SavedQueue) => { if (isProcessing) return alert("Stop processing first."); if (queue.length > 0 && confirm("Overwrite active queue?") === false) return; setQueue(saved.items); queueService.setQueue(saved.items); setQueueName(saved.name); setQueueId(saved.id); setActiveTab('upload'); };
  const handleDeleteFromLibrary = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); if (confirm("Delete this curriculum?")) { await storageService.deleteQueue(id); await loadLibrary(); } };
  const handleClearActive = () => { if (isProcessing) return alert("Stop processing first."); if (confirm("Clear active workspace?")) { setQueue([]); queueService.setQueue([]); setQueueId(null); setQueueName('My Curriculum'); localStorage.removeItem('neuro_syllabus_queue'); localStorage.removeItem('neuro_syllabus_meta'); setBatchConfig({ structureProvider: null, structureModel: '', customStructurePrompt: '', customContentPrompt: '' }); } };

  const completedCount = queue.filter(q => q.status === 'done').length;
  const phase1Count = queue.filter(q => ['struct_ready', 'generating_note', 'done', 'paused_for_review'].includes(q.status)).length;
  const phase1Progress = queue.length > 0 ? (phase1Count / queue.length) * 100 : 0;
  const phase2Count = queue.filter(q => q.status === 'done').length;
  const phase2Progress = queue.length > 0 ? (phase2Count / queue.length) * 100 : 0;

  const getStatusIcon = (item: SyllabusItem) => {
      if (item.retryCount && item.retryCount > 0 && item.status !== 'done') { return <AlertCircle size={14} className="text-amber-500 animate-pulse" />; }
      switch(item.status) {
          case 'pending': return <Circle size={14} className="text-[var(--ui-text-muted)]" />;
          case 'drafting_struct': return <Loader2 size={14} className="text-blue-400 animate-spin" />;
          case 'struct_ready': return <CheckCircle2 size={14} className="text-blue-500" />; 
          case 'paused_for_review': return <Eye size={14} className="text-amber-400 animate-pulse" />;
          case 'generating_note': return <RefreshCw size={14} className="text-purple-400 animate-spin" />;
          case 'done': return <CheckCircle2 size={14} className="text-green-500" />;
          case 'error': return <ShieldAlert size={14} className="text-red-500" />;
          default: return <Circle size={14} />;
      }
  };

  return (
    <div className={`mx-auto h-full flex flex-col animate-fade-in p-6 relative transition-all ${isLaptop ? 'max-w-7xl' : 'max-w-4xl'}`}>
      
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--ui-text-main)] flex items-center gap-2">
            <ListChecks className="text-[var(--ui-primary)]" />
            Autonomous Curriculum Engine
          </h2>
          <p className="text-[var(--ui-text-muted)] text-sm mt-1">
            Batch Processor with Circuit Breaker & Human-in-the-Loop Review.
          </p>
        </div>
        
        {/* View Switcher */}
        <div className="flex bg-[var(--ui-surface)] p-1 rounded-lg border border-[var(--ui-border)] self-start md:self-auto">
           <button onClick={() => setActiveTab('library')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${activeTab === 'library' ? 'bg-[var(--ui-bg)] text-[var(--ui-text-main)] shadow border border-[var(--ui-border)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}>
             <FolderOpen size={14} /> Library
           </button>
           <button onClick={() => setActiveTab('upload')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${(activeTab === 'upload' || activeTab === 'text') ? 'bg-[var(--ui-bg)] text-[var(--ui-text-main)] shadow border border-[var(--ui-border)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}>
             <RefreshCw size={14} /> Generator
           </button>
        </div>
      </div>

      {/* --- LIBRARY VIEW --- */}
      {activeTab === 'library' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className={`grid gap-4 overflow-y-auto custom-scrollbar pr-2 pb-20 ${isLaptop ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
             <div onClick={() => { if(!isProcessing) { setQueue([]); setQueueId(null); setQueueName("New Curriculum"); setActiveTab('upload'); } else alert("Processing active."); }}
               className="border-2 border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-bg)] hover:border-[var(--ui-primary)] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[150px] group"
             >
                <div className="bg-[var(--ui-bg)] p-3 rounded-full mb-3 group-hover:bg-[var(--ui-primary)] group-hover:text-white transition-colors text-[var(--ui-text-muted)]"><RefreshCw size={24} /></div>
                <span className="font-bold text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text-main)]">Create New Curriculum</span>
             </div>
             {savedQueues.map(saved => (
               <div key={saved.id} className="relative bg-[var(--ui-surface)] border border-[var(--ui-border)] hover:border-[var(--ui-primary)]/50 rounded-xl p-5 transition-all group shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                     <div className="flex items-center gap-2">
                        <FolderOpen className="text-[var(--ui-primary)]" size={18} />
                        <h3 className="font-bold text-[var(--ui-text-main)] truncate max-w-[150px]">{saved.name}</h3>
                     </div>
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleDeleteFromLibrary(saved.id, e)} className="p-1.5 hover:bg-red-900/50 rounded text-[var(--ui-text-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                     </div>
                  </div>
                  <div className="text-xs text-[var(--ui-text-muted)] mb-4 space-y-1">
                     <p>{saved.items.length} Topics</p>
                     <p>Status: {saved.items.filter(i => i.status === 'done').length}/{saved.items.length} Complete</p>
                  </div>
                  <button onClick={() => handleLoadFromLibrary(saved)} className="w-full py-2 bg-[var(--ui-bg)] hover:bg-[var(--ui-border)] text-xs font-bold text-[var(--ui-text-main)] rounded-lg transition-colors border border-[var(--ui-border)]">Load Workspace</button>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* --- GENERATOR / ACTIVE VIEW --- */}
      {(activeTab === 'upload' || activeTab === 'text') && (
        <div className={`flex-1 flex flex-col overflow-hidden ${isLaptop && queue.length > 0 ? 'grid grid-cols-12 gap-6' : ''}`}>
          
          {/* CONTROLS & CONFIG (Right Panel on Laptop) */}
          {queue.length > 0 && (
             <div className={`bg-[var(--ui-surface)] border border-[var(--ui-border)] p-4 rounded-xl flex flex-col gap-4 shrink-0 shadow-lg ${isLaptop ? 'col-span-4 order-2 h-fit sticky top-0' : 'mb-4'}`}>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-[var(--ui-primary)]/20 p-2 rounded-lg text-[var(--ui-primary)]"><Archive size={18} /></div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-[var(--ui-text-main)] text-sm truncate max-w-[120px]">{queueName}</h3>
                                    <button onClick={() => { const n = prompt("Rename:", queueName); if(n) setQueueName(n); }} className="text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"><Edit2 size={12} /></button>
                                </div>
                                <p className="text-[10px] text-[var(--ui-text-muted)]">{queue.length} Topics Loaded</p>
                            </div>
                        </div>
                        
                        {/* Auto Approve Toggle */}
                        {!isProcessing && (
                            <div className="flex items-center gap-2 bg-[var(--ui-bg)] p-1.5 rounded-lg border border-[var(--ui-border)]">
                                <span className={`text-[10px] font-bold ${autoApprove ? 'text-[var(--ui-text-muted)]' : 'text-amber-400'}`}>REVIEW</span>
                                <div 
                                    onClick={() => setAutoApprove(!autoApprove)}
                                    className={`w-8 h-4 rounded-full cursor-pointer relative transition-colors ${autoApprove ? 'bg-[var(--ui-primary)]' : 'bg-gray-600'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow ${autoApprove ? 'left-4.5' : 'left-0.5'}`} style={{left: autoApprove ? '18px' : '2px'}}></div>
                                </div>
                                <span className={`text-[10px] font-bold ${autoApprove ? 'text-green-400' : 'text-[var(--ui-text-muted)]'}`}>AUTO</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex flex-col gap-2 w-full">
                        {/* START / STOP */}
                        {!isProcessing ? (
                            <button 
                                onClick={handleStartBatch}
                                disabled={completedCount === queue.length}
                                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold rounded-lg transition-colors shadow-lg whitespace-nowrap w-full justify-center
                                ${completedCount === queue.length ? 'bg-[var(--ui-bg)] text-[var(--ui-text-muted)]' : 'bg-[var(--ui-primary)] hover:opacity-90 text-white'}`}
                            >
                                <Zap size={14} fill="currentColor" /> {circuitStatus?.includes("BREAKER") ? "RESET CIRCUIT" : "START BATCH"}
                            </button>
                        ) : (
                            <button onClick={handleStopBatch} className="flex items-center gap-2 px-4 py-3 bg-red-900/80 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors shadow-lg animate-pulse w-full justify-center">
                                <StopCircle size={14} /> STOP PROCESSING
                            </button>
                        )}

                        <div className="flex gap-2 w-full">
                            <button onClick={handleSaveToLibrary} className="flex-1 p-2 bg-[var(--ui-bg)] hover:bg-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold border border-[var(--ui-border)]"><Save size={14} /> Save</button>
                            <button onClick={handleClearActive} className="flex-1 p-2 bg-[var(--ui-bg)] hover:bg-red-900/30 text-[var(--ui-text-muted)] hover:text-red-400 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold border border-[var(--ui-border)]"><Trash2 size={14} /> Clear</button>
                        </div>
                    </div>
                </div>

                {/* --- ADVANCED BATCH CONFIGURATION --- */}
                {!isProcessing && (
                  <div className="border border-[var(--ui-border)] rounded-xl bg-[var(--ui-bg)]/50 overflow-hidden">
                     <button 
                       onClick={() => setShowAdvanced(!showAdvanced)} 
                       className="w-full flex items-center justify-between p-3 text-xs font-bold text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] transition-colors"
                     >
                       <span className="flex items-center gap-2"><Settings2 size={14}/> Advanced Config</span>
                       {showAdvanced ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                     </button>
                     
                     {showAdvanced && (
                       <div className="p-4 bg-[var(--ui-bg)] flex flex-col gap-4 animate-slide-up border-t border-[var(--ui-border)]">
                          
                          {/* Phase 1 */}
                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-[var(--ui-primary)] font-bold text-[10px] uppercase tracking-widest">
                                <Split size={12}/> Phase 1: Architect
                             </div>
                             <div className="p-2 bg-[var(--ui-surface)] rounded border border-[var(--ui-border)] space-y-2">
                                <div className="flex gap-1">
                                    <button onClick={() => setBatchConfig({...batchConfig, structureProvider: null})} className={`flex-1 py-1 text-[9px] font-bold rounded border ${batchConfig.structureProvider === null ? 'bg-[var(--ui-primary)]/20 border-[var(--ui-primary)]' : 'bg-[var(--ui-bg)] border-[var(--ui-border)]'}`}>Default</button>
                                    <button onClick={() => setBatchConfig({...batchConfig, structureProvider: AIProvider.GEMINI})} className={`flex-1 py-1 text-[9px] font-bold rounded border ${batchConfig.structureProvider === AIProvider.GEMINI ? 'bg-indigo-900/40 border-indigo-500' : 'bg-[var(--ui-bg)] border-[var(--ui-border)]'}`}>Gemini</button>
                                    <button onClick={() => setBatchConfig({...batchConfig, structureProvider: AIProvider.GROQ})} className={`flex-1 py-1 text-[9px] font-bold rounded border ${batchConfig.structureProvider === AIProvider.GROQ ? 'bg-orange-900/40 border-orange-500' : 'bg-[var(--ui-bg)] border-[var(--ui-border)]'}`}>Groq</button>
                                </div>
                                <textarea 
                                    value={batchConfig.customStructurePrompt}
                                    onChange={(e) => setBatchConfig({...batchConfig, customStructurePrompt: e.target.value})}
                                    className="w-full h-12 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded p-2 text-[10px] outline-none resize-none"
                                    placeholder="Blueprint Prompt..."
                                />
                             </div>
                          </div>

                          {/* Phase 2 */}
                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-green-400 font-bold text-[10px] uppercase tracking-widest">
                                <Cpu size={12}/> Phase 2: Factory
                             </div>
                             <div className="p-2 bg-[var(--ui-surface)] rounded border border-[var(--ui-border)] space-y-2">
                                <div className="text-[9px] text-[var(--ui-text-muted)]">Global Model: {config.model}</div>
                                <textarea 
                                    value={batchConfig.customContentPrompt}
                                    onChange={(e) => setBatchConfig({...batchConfig, customContentPrompt: e.target.value})}
                                    className="w-full h-12 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded p-2 text-[10px] outline-none resize-none"
                                    placeholder="Fabrication Prompt..."
                                />
                             </div>
                          </div>
                       </div>
                     )}
                  </div>
                )}

                {/* Circuit Status */}
                {circuitStatus && (
                    <div className={`text-xs text-center font-mono py-1 rounded ${circuitStatus.includes('BREAKER') ? 'bg-red-900/20 text-red-400 border border-red-900' : 'bg-blue-900/20 text-blue-400'}`}>
                        {circuitStatus}
                    </div>
                )}

                {/* VISUAL PROGRESS */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--ui-bg)] p-2 rounded-lg border border-[var(--ui-border)]">
                        <div className="flex justify-between text-[9px] text-[var(--ui-text-muted)] mb-1 uppercase font-bold">
                            <span>P1</span>
                            <span>{Math.round(phase1Progress)}%</span>
                        </div>
                        <div className="h-1 bg-[var(--ui-surface)] rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${phase1Progress}%` }}></div>
                        </div>
                    </div>
                    <div className="bg-[var(--ui-bg)] p-2 rounded-lg border border-[var(--ui-border)]">
                        <div className="flex justify-between text-[9px] text-[var(--ui-text-muted)] mb-1 uppercase font-bold">
                            <span>P2</span>
                            <span>{Math.round(phase2Progress)}%</span>
                        </div>
                        <div className="h-1 bg-[var(--ui-surface)] rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${phase2Progress}%` }}></div>
                        </div>
                    </div>
                </div>
             </div>
          )}

          {/* QUEUE LIST (Left Panel on Laptop) */}
          <div className={`${isLaptop && queue.length > 0 ? 'col-span-8 order-1 h-full overflow-hidden flex flex-col' : 'flex-1 flex flex-col overflow-hidden'}`}>
             {queue.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-[var(--ui-border)] rounded-3xl bg-[var(--ui-surface)]/20">
                  <div className="w-full max-w-md space-y-6">
                    <div className="flex bg-[var(--ui-bg)] p-1 rounded-lg self-center mx-auto w-fit border border-[var(--ui-border)]">
                       <button onClick={() => setActiveTab('upload')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'upload' ? 'bg-[var(--ui-primary)] text-white shadow' : 'text-[var(--ui-text-muted)]'}`}>File Upload</button>
                       <button onClick={() => setActiveTab('text')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'text' ? 'bg-[var(--ui-primary)] text-white shadow' : 'text-[var(--ui-text-muted)]'}`}>Raw Text</button>
                    </div>

                    {activeTab === 'upload' ? <FileUploader files={syllabusFile} onFilesChange={setSyllabusFile} /> : <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste syllabus text, JSON list, or loose topics here..." className="w-full h-32 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl p-3 text-sm text-[var(--ui-text-main)] focus:border-[var(--ui-primary)] outline-none resize-none" />}
                    
                    {error && <div className="text-red-400 text-xs text-center bg-red-900/10 p-2 rounded">{error}</div>}

                    <button onClick={handleParse} disabled={isParsing || (activeTab === 'upload' ? syllabusFile.length === 0 : !rawText.trim())} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50">
                      {isParsing ? <><RefreshCw className="animate-spin inline mr-2"/> Parsing...</> : "Generate Queue"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 pb-10">
                  {queue.map((item, index) => {
                    const isActive = ['generating_note', 'drafting_struct'].includes(item.status);
                    const isPaused = item.status === 'paused_for_review';
                    const isDone = item.status === 'done';
                    const isError = item.status === 'error';
                    const hasRetry = item.retryCount && item.retryCount > 0;

                    return (
                      <div 
                        key={item.id} 
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`relative p-3 rounded-lg border transition-all duration-300 group cursor-grab active:cursor-grabbing ${
                          isActive ? 'bg-[var(--ui-primary)]/10 border-[var(--ui-primary)] shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 
                          isPaused ? 'bg-amber-900/10 border-amber-500/50 border-dashed' :
                          isDone ? 'bg-green-900/10 border-green-900/30' : 
                          isError ? 'bg-red-900/10 border-red-900/30' : 'bg-[var(--ui-surface)] border-[var(--ui-border)]'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 overflow-hidden flex-1" onClick={() => !isProcessing && onSelectTopic(item.topic)}>
                            <div className="text-[var(--ui-text-muted)] cursor-move" title="Drag to reorder">
                              <GripVertical size={14} />
                            </div>
                            <span className="text-[10px] font-mono text-[var(--ui-text-muted)] w-5 shrink-0">{(index + 1).toString().padStart(2, '0')}</span>
                            <div className={`p-1.5 rounded-full shrink-0 ${isPaused ? 'bg-amber-500/20 text-amber-500' : 'bg-[var(--ui-bg)] text-[var(--ui-text-muted)]'}`}>
                               {getStatusIcon(item)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className={`text-sm truncate ${isDone ? 'text-[var(--ui-text-muted)]' : 'text-[var(--ui-text-main)] font-bold'}`}>{item.topic}</div>
                              <div className={`text-[10px] truncate ${isActive ? 'text-[var(--ui-primary)] animate-pulse' : isError ? 'text-red-400' : isPaused ? 'text-amber-400' : 'text-[var(--ui-text-muted)]'}`}>
                                  {hasRetry ? `(Retry ${item.retryCount}) ` : ''} 
                                  {isPaused ? 'Waiting for Review (Click Eye)' : item.status}
                                  {item.errorMsg && ` - ${item.errorMsg}`}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                             {isPaused && (
                                 <button onClick={() => openReview(item)} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded animate-pulse shadow-lg">REVIEW</button>
                             )}
                             {isDone && <button className="p-1.5 bg-[var(--ui-bg)] hover:bg-green-900/30 text-[var(--ui-text-muted)] hover:text-green-400 rounded"><BookOpen size={14} /></button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      )}

      {/* --- REVIEW MODAL --- */}
      {viewingItem && (
          <div className="absolute inset-0 z-50 bg-[#0a0f18]/95 backdrop-blur-md flex flex-col p-6 animate-fade-in">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-800">
                  <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Settings2 className="text-amber-400"/> Blueprint Review
                      </h3>
                      <p className="text-xs text-gray-500">Edit the AI-generated structure before full generation.</p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setViewingItem(null)} className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800">Cancel</button>
                      <button onClick={handleApprove} className="px-4 py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white flex items-center gap-2 shadow-lg">
                          <CheckCircle2 size={16}/> Approve & Continue
                      </button>
                  </div>
              </div>
              
              <div className="flex-1 relative bg-black/30 rounded-xl border border-gray-700 overflow-hidden">
                  <textarea 
                     value={editedStructure} 
                     onChange={(e) => setEditedStructure(e.target.value)}
                     className="absolute inset-0 w-full h-full bg-transparent p-6 text-sm font-mono text-gray-300 resize-none outline-none custom-scrollbar"
                  />
              </div>
          </div>
      )}

    </div>
  );
};

export default SyllabusFlow;
