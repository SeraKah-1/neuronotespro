
import React, { useState, useEffect } from 'react';
import { HistoryItem, NoteMode } from '../types';
import { StorageService } from '../services/storageService';
import { NotificationService } from '../services/notificationService';
import { 
  Search, Cloud, Filter, 
  Trash2, Download, CloudUpload, BrainCircuit,
  Zap, Microscope, PenTool, GraduationCap, LayoutGrid, List as ListIcon,
  RefreshCw, CheckCircle2
} from 'lucide-react';

interface NeuralVaultProps {
  onSelectNote: (note: HistoryItem) => void;
  onImportCloud: (note: HistoryItem) => void;
}

const NeuralVault: React.FC<NeuralVaultProps> = ({ onSelectNote, onImportCloud }) => {
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [storage] = useState(StorageService.getInstance());
  const [notifications] = useState(NotificationService.getInstance());
  
  // Filters
  const [activeFilter, setActiveFilter] = useState<'all' | 'synced' | 'local' | 'cloud'>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const loadVault = async () => {
    setLoading(true);
    try {
        const unified = await storage.getUnifiedNotes(true);
        setNotes(unified);
    } catch (e) {
        console.error("Vault Load Error", e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, []);

  const handleDelete = async (note: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Permanently delete "${note.topic}"? This cannot be undone.`)) return;
    
    try {
        if (note._status === 'cloud' || note._status === 'synced') {
            await storage.deleteNoteFromCloud(note.id);
        }
        if (note._status === 'local' || note._status === 'synced') {
            storage.deleteNoteLocal(note.id);
        }
        loadVault();
    } catch (e) {
        alert("Delete failed");
    }
  };

  const handleUpload = async (note: HistoryItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!storage.isCloudReady()) return alert("Cloud not configured");
      try {
          await storage.uploadNoteToCloud(note);
          notifications.send("Upload Success", `${note.topic} synced to cloud.`, "cloud-success");
          loadVault(); // Refresh status
      } catch (e: any) { alert(e.message); }
  };
  
  const handleDownload = async (note: HistoryItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!storage.isCloudReady()) return alert("Cloud disconnected");
      try {
          await storage.importCloudNote(note);
          notifications.send("Import Success", `${note.topic} downloaded to local storage.`, "download-success");
          loadVault(); // Refresh status to synced
      } catch (e: any) {
          alert("Import failed: " + e.message);
      }
  };

  // Helper to get all unique tags
  const allTags = Array.from(new Set(notes.flatMap(n => n.tags || []))).sort();

  // Filter Logic
  const filteredNotes = notes.filter(n => {
      const matchesSearch = n.topic.toLowerCase().includes(search.toLowerCase()) || (n.content && n.content.toLowerCase().includes(search.toLowerCase()));
      const matchesFilter = activeFilter === 'all' ? true : n._status === activeFilter;
      const matchesTag = activeTag ? n.tags?.includes(activeTag) : true;
      return matchesSearch && matchesFilter && matchesTag;
  });

  const getModeIcon = (mode: NoteMode) => {
    switch (mode) {
      case NoteMode.CHEAT_CODES: return <Zap size={14} className="text-amber-400" />;
      case NoteMode.CUSTOM: return <PenTool size={14} className="text-pink-400" />;
      default: return <GraduationCap size={14} className="text-neuro-primary" />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="bg-neuro-surface border-b border-white/5 p-4 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
            <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-500"/>
                    <input 
                        type="text" 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)} 
                        placeholder="Search Neural Vault..." 
                        className="w-full md:w-64 bg-black/30 border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-neuro-primary outline-none"
                    />
                </div>
                <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}><LayoutGrid size={14}/></button>
                    <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}><ListIcon size={14}/></button>
                </div>
                <button onClick={loadVault} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"><RefreshCw size={16}/></button>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                {['all', 'synced', 'local', 'cloud'].map(f => (
                    <button 
                        key={f}
                        onClick={() => setActiveFilter(f as any)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all whitespace-nowrap
                        ${activeFilter === f 
                            ? 'bg-neuro-primary/20 border-neuro-primary text-white' 
                            : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>
        </div>

        {/* Tags Bar */}
        {allTags.length > 0 && (
            <div className="px-4 py-2 border-b border-white/5 flex gap-2 overflow-x-auto custom-scrollbar bg-gray-900/30 shrink-0">
                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase mr-2 shrink-0">
                    <Filter size={10} /> Tags:
                </div>
                <button 
                    onClick={() => setActiveTag(null)}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors whitespace-nowrap ${!activeTag ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
                >
                    ALL
                </button>
                {allTags.map(tag => (
                    <button 
                        key={tag}
                        onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                        className={`px-2 py-0.5 rounded text-[10px] border transition-colors whitespace-nowrap ${activeTag === tag ? 'bg-neuro-accent/20 border-neuro-accent text-neuro-accent' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                    >
                        #{tag}
                    </button>
                ))}
            </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-4">
                    <RefreshCw size={32} className="animate-spin text-neuro-primary"/>
                    <p className="text-xs font-mono">SYNCING NEURAL VAULT...</p>
                </div>
            ) : filteredNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                    <BrainCircuit size={48} className="mb-4 opacity-20"/>
                    <p className="text-sm">No neural pathways found matching your query.</p>
                </div>
            ) : (
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
                    {filteredNotes.map(note => (
                        <div 
                            key={note.id}
                            onClick={() => note._status === 'cloud' ? handleDownload(note, {} as any) : onSelectNote(note)}
                            className={`
                                group relative border rounded-xl p-4 transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] cursor-pointer
                                ${note._status === 'cloud' ? 'bg-[#0a0f18]/80 border-cyan-900/30 border-dashed hover:border-cyan-500/50' : 'bg-[#0f172a] border-gray-800 hover:border-neuro-primary/50'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${note._status === 'cloud' ? 'bg-cyan-900/20 text-cyan-400' : 'bg-neuro-primary/10 text-neuro-primary'}`}>
                                        {getModeIcon(note.mode)}
                                    </div>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                        note._status === 'synced' ? 'bg-green-900/20 text-green-400 border-green-900/30' :
                                        note._status === 'cloud' ? 'bg-cyan-900/20 text-cyan-400 border-cyan-900/30' :
                                        'bg-gray-800 text-gray-500 border-gray-700'
                                    }`}>
                                        {note._status === 'synced' ? 'Synced' : note._status === 'cloud' ? 'Cloud' : 'Local'}
                                    </span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {note._status === 'local' && (
                                        <button onClick={(e) => handleUpload(note, e)} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Upload"><CloudUpload size={14}/></button>
                                    )}
                                    {note._status === 'cloud' && (
                                        <button onClick={(e) => handleDownload(note, e)} className="p-1.5 hover:bg-white/10 rounded text-cyan-400 hover:text-cyan-200" title="Download to Local"><Download size={14}/></button>
                                    )}
                                    <button onClick={(e) => handleDelete(note, e)} className="p-1.5 hover:bg-red-900/20 rounded text-gray-500 hover:text-red-400" title="Delete"><Trash2 size={14}/></button>
                                </div>
                            </div>
                            
                            <h3 className="font-bold text-white mb-1 truncate">{note.topic}</h3>
                            <p className="text-xs text-gray-500 line-clamp-2 mb-3 h-8">
                                {note.snippet || (note.content ? note.content.substring(0, 150).replace(/[#*`]/g, '') : "Content available in cloud...")}
                            </p>
                            
                            <div className="flex justify-between items-center text-[10px] text-gray-600">
                                <span>{new Date(note.timestamp).toLocaleDateString()}</span>
                                <div className="flex gap-1">
                                    {note.tags?.slice(0, 2).map(t => <span key={t} className="bg-white/5 px-1.5 rounded text-gray-500">#{t}</span>)}
                                    {(note.tags?.length || 0) > 2 && <span>+{note.tags!.length - 2}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};

export default NeuralVault;
