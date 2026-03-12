
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HistoryItem, Folder } from '../types';
import { StorageService } from '../services/storageService';
import { NotificationService } from '../services/notificationService';
import { 
  FileText, Trash2, Edit2, UploadCloud, RefreshCw, Clock, Search, 
  ChevronDown, ChevronRight, Tag, Cloud, Laptop, CheckCircle2, 
  Folder as FolderIcon, FolderPlus, MoreHorizontal, CornerDownRight, 
  Grid, Plus, FilePlus
} from 'lucide-react';

interface FileSystemProps {
  onSelectNote: (note: HistoryItem) => void;
  activeNoteId: string | null;
}

const FileSystem: React.FC<FileSystemProps> = ({ onSelectNote, activeNoteId }) => {
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [storage] = useState(StorageService.getInstance());
  const [notifications] = useState(NotificationService.getInstance());
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'recent' | 'library'>('library');
  
  // Tree State
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({}); 
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null); 

  // Drag & Drop State
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // --- CORE: DATA LOADER (OPTIMIZED) ---
  const refreshData = useCallback(async (forceSync = false) => {
    setLoading(true);
    try {
        // PERF FIX: Load metadata ONLY. Do not load full content strings into the list view.
        // UPDATED: Use getUnifiedNotes to trigger Cloud Sync if connected
        const n = await storage.getUnifiedNotes(forceSync);
        n.sort((a, b) => b.timestamp - a.timestamp);
        setNotes([...n]);
        
        const f = storage.getFolders();
        setFolders(f);
    } catch (e) {
        console.error("FileSystem Load Error", e);
    } finally {
        setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    refreshData(true); // Force sync on initial mount
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refreshData]);

  // --- ACTIONS ---
  const handleDeleteNote = async (note: HistoryItem) => {
    if (confirm(`🗑️ Delete "${note.topic}"?`)) {
      try {
          if (note._status === 'cloud' || note._status === 'synced') await storage.deleteNoteFromCloud(note.id);
          if (note._status === 'local' || note._status === 'synced') await storage.deleteNoteLocal(note.id);
          refreshData();
      } catch(err) { alert("Error deleting note."); }
    }
  };
  
  const handleRenameNote = async (id: string, current: string) => {
    const newName = prompt("Rename Topic:", current);
    if (newName && newName.trim()) {
       await storage.renameNote(id, newName.trim());
       refreshData();
    }
  };

  const handleCreateFolder = () => {
    const name = prompt("New Folder Name:");
    if (name && name.trim()) {
      const newFolder: Folder = { id: Date.now().toString(), name: name.trim(), timestamp: Date.now() };
      storage.saveFolder(newFolder);
      setExpandedFolders(prev => ({...prev, [newFolder.id]: true}));
      refreshData();
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (confirm("Delete folder? Notes inside will be moved to root.")) {
      await storage.deleteFolder(id);
      refreshData();
    }
  };

  const handleDrop = async (targetFolderId: string | null) => {
      if (draggedNoteId) {
          await storage.moveNoteToFolder(draggedNoteId, targetFolderId);
          refreshData();
          setDraggedNoteId(null);
          setDragOverFolderId(null);
          if (targetFolderId && targetFolderId !== 'ROOT') setExpandedFolders(prev => ({...prev, [targetFolderId]: true}));
      }
  };
  
  const handleCloudUpload = async (note: HistoryItem) => {
      try {
          await storage.uploadNoteToCloud(note);
          notifications.send("Sync Complete", `Uploaded "${note.topic}" to Cloud.`, "sync-success");
          refreshData();
      } catch(e: any) {
          alert("Upload failed: " + e.message);
      }
  };

  // --- TREE BUILDER ---
  const treeData = useMemo(() => {
      if (activeTab !== 'library') return { roots: [], folderMap: {} };

      const rootNotes = notes.filter(n => !n.folderId && (searchQuery ? n.topic.toLowerCase().includes(searchQuery.toLowerCase()) : true));
      
      const folderMap: Record<string, HistoryItem[]> = {};
      folders.forEach(f => {
          folderMap[f.id] = notes.filter(n => n.folderId === f.id && (searchQuery ? n.topic.toLowerCase().includes(searchQuery.toLowerCase()) : true));
      });

      const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));

      return { rootNotes, sortedFolders, folderMap };
  }, [notes, folders, activeTab, searchQuery]);

  // --- GROUPED DATA (RECENT) ---
  const groupedNotes = useMemo(() => {
      if (activeTab !== 'recent') return [];
      
      const result = notes.filter(n => searchQuery ? n.topic.toLowerCase().includes(searchQuery.toLowerCase()) : true);
      const getGroup = (ts: number) => {
          const d = new Date(ts), now = new Date();
          if (d.toDateString() === now.toDateString()) return "Today";
          const y = new Date(now); y.setDate(now.getDate() - 1);
          if (d.toDateString() === y.toDateString()) return "Yesterday";
          if (Math.abs(now.getTime() - ts) < 7*24*60*60*1000) return "Previous 7 Days";
          return "Older";
      };

      const groups: Record<string, HistoryItem[]> = {};
      result.forEach(n => {
          const g = getGroup(n.timestamp);
          if (!groups[g]) groups[g] = [];
          groups[g].push(n);
      });

      return ["Today", "Yesterday", "Previous 7 Days", "Older"]
        .filter(k => groups[k] && groups[k].length > 0)
        .map(k => ({ title: k, notes: groups[k] }));
  }, [notes, activeTab, searchQuery]);


  const handleMoveNote = async (noteId: string, folderId: string | null) => {
      await storage.moveNoteToFolder(noteId, folderId);
      refreshData();
      if (folderId && folderId !== 'ROOT') setExpandedFolders(prev => ({...prev, [folderId]: true}));
  };

  // --- SUB-COMPONENT: NOTE ROW ---
  const NoteRow: React.FC<{ note: HistoryItem; depth?: number }> = React.memo(({ note, depth = 0 }) => {
      const isActive = activeNoteId === note.id;
      
      return (
          <div 
            className={`
                group flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-all text-xs select-none
                ${isActive ? 'bg-[var(--ui-primary-glow)] text-[var(--ui-text-main)] font-medium border-l-2 border-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text-main)] border-l-2 border-transparent'}
                ${draggedNoteId === note.id ? 'opacity-50' : ''}
            `}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => onSelectNote(note)}
            draggable
            onDragStart={(e) => {
                setDraggedNoteId(note.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", note.id);
            }}
          >
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <FileText size={13} className={isActive ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text-main)]'} />
                  <span className="truncate">{note.topic}</span>
              </div>
              
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === note.id ? null : note.id); }}
                    className="p-1 hover:bg-[var(--ui-bg)] rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"
                  >
                      <MoreHorizontal size={12}/>
                  </button>
              </div>

              {/* POPUP MENU */}
              {activeMenuId === note.id && (
                  <div ref={menuRef} className="absolute right-2 z-50 w-40 bg-[var(--ui-surface)] border border-[var(--ui-border)] shadow-xl rounded-lg overflow-hidden animate-fade-in flex flex-col py-1">
                      <button onClick={(e) => { e.stopPropagation(); handleRenameNote(note.id, note.topic); setActiveMenuId(null); }} className="px-3 py-2 text-left text-[10px] hover:bg-[var(--ui-bg)] flex items-center gap-2 text-[var(--ui-text-main)]"><Edit2 size={10}/> Rename</button>
                      
                      {/* Move To Submenu */}
                      <div className="relative group/move">
                          <button className="w-full px-3 py-2 text-left text-[10px] hover:bg-[var(--ui-bg)] flex items-center justify-between text-[var(--ui-text-main)]">
                              <span className="flex items-center gap-2"><CornerDownRight size={10}/> Move To...</span>
                              <ChevronRight size={10}/>
                          </button>
                          <div className="absolute left-full top-0 ml-1 w-32 bg-[var(--ui-surface)] border border-[var(--ui-border)] shadow-xl rounded-lg overflow-hidden hidden group-hover/move:flex flex-col py-1 z-50">
                              <button 
                                  onClick={(e) => { e.stopPropagation(); handleMoveNote(note.id, null); setActiveMenuId(null); }} 
                                  className="px-3 py-2 text-left text-[10px] hover:bg-[var(--ui-bg)] text-[var(--ui-text-main)] truncate"
                              >
                                  [Root]
                              </button>
                              {folders.map(f => (
                                  <button 
                                      key={f.id}
                                      onClick={(e) => { e.stopPropagation(); handleMoveNote(note.id, f.id); setActiveMenuId(null); }} 
                                      className="px-3 py-2 text-left text-[10px] hover:bg-[var(--ui-bg)] text-[var(--ui-text-main)] truncate"
                                  >
                                      {f.name}
                                  </button>
                              ))}
                          </div>
                      </div>

                      {note._status === 'local' && <button onClick={(e) => { e.stopPropagation(); handleCloudUpload(note); setActiveMenuId(null); }} className="px-3 py-2 text-left text-[10px] hover:bg-[var(--ui-bg)] flex items-center gap-2 text-cyan-500"><UploadCloud size={10}/> Upload Cloud</button>}
                      <div className="h-[1px] bg-[var(--ui-border)] my-1"></div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(note); setActiveMenuId(null); }} className="px-3 py-2 text-left text-[10px] hover:bg-[var(--ui-bg)] flex items-center gap-2 text-red-400"><Trash2 size={10}/> Delete</button>
                  </div>
              )}
          </div>
      );
  });

  return (
    <div className="flex flex-col h-full bg-[var(--ui-sidebar)] rounded-xl border border-[var(--ui-border)] overflow-hidden">
       {/* HEADER */}
       <div className="flex flex-col gap-3 p-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] shrink-0">
         <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-[var(--ui-text-muted)] uppercase tracking-widest">Explorer</span>
            <div className="flex gap-1">
                <button onClick={handleCreateFolder} className="p-1.5 hover:bg-[var(--ui-bg)] rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]" title="New Folder"><FolderPlus size={14}/></button>
                <button onClick={() => refreshData(true)} className="p-1.5 hover:bg-[var(--ui-bg)] rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]" title="Refresh"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/></button>
            </div>
         </div>
         
         <div className="relative group">
            <Search size={12} className="absolute left-2.5 top-2 text-[var(--ui-text-muted)] group-focus-within:text-[var(--ui-primary)]"/>
            <input 
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..." 
                className="w-full bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg py-1.5 pl-8 pr-2 text-xs text-[var(--ui-text-main)] focus:border-[var(--ui-primary)] outline-none transition-all"
            />
         </div>

         <div className="flex bg-[var(--ui-bg)] p-0.5 rounded-lg border border-[var(--ui-border)]">
             <button onClick={() => setActiveTab('library')} className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${activeTab === 'library' ? 'bg-[var(--ui-surface)] text-[var(--ui-text-main)] shadow-sm' : 'text-[var(--ui-text-muted)]'}`}>Library</button>
             <button onClick={() => setActiveTab('recent')} className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${activeTab === 'recent' ? 'bg-[var(--ui-surface)] text-[var(--ui-text-main)] shadow-sm' : 'text-[var(--ui-text-muted)]'}`}>Recent</button>
         </div>
       </div>
       
       {/* CONTENT */}
       <div 
         className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 relative"
         onDragOver={(e) => { e.preventDefault(); setDragOverFolderId('ROOT'); }}
         onDragLeave={() => setDragOverFolderId(null)}
         onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(null); }}
       >
          {/* DRAG OVERLAY FOR ROOT */}
          {draggedNoteId && dragOverFolderId === 'ROOT' && (
              <div className="absolute inset-0 bg-[var(--ui-primary)]/10 border-2 border-[var(--ui-primary)] border-dashed rounded-lg z-10 pointer-events-none flex items-center justify-center">
                  <span className="text-xs font-bold text-[var(--ui-primary)] bg-[var(--ui-bg)] px-2 py-1 rounded">Move to Root</span>
              </div>
          )}

          {/* === LIBRARY TAB (TREE VIEW) === */}
          {activeTab === 'library' && (
              <div className="flex flex-col gap-0.5">
                  {/* FOLDERS */}
                  {treeData.sortedFolders.map(folder => {
                      const isOpen = expandedFolders[folder.id];
                      const folderNotes = treeData.folderMap[folder.id] || [];
                      const isDragOver = dragOverFolderId === folder.id;

                      return (
                          <div key={folder.id} className="relative">
                              <div 
                                className={`
                                    flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-all group
                                    ${isDragOver ? 'bg-[var(--ui-primary)]/20 text-[var(--ui-primary)]' : 'text-[var(--ui-text-main)] hover:bg-[var(--ui-surface)]'}
                                `}
                                onClick={() => setExpandedFolders(prev => ({...prev, [folder.id]: !prev[folder.id]}))}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(folder.id); }}
                                onDragLeave={(e) => { e.stopPropagation(); setDragOverFolderId(null); }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(folder.id); }}
                              >
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      <button className="p-0.5 rounded hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)]">
                                          {isOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                      </button>
                                      <FolderIcon size={13} className={isDragOver ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'} fill={isDragOver ? "currentColor" : "none"}/>
                                      <span className="text-xs font-semibold truncate">{folder.name}</span>
                                      <span className="text-[9px] text-[var(--ui-text-muted)] ml-1">({folderNotes.length})</span>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/20 text-[var(--ui-text-muted)] hover:text-red-400 rounded transition-all">
                                      <Trash2 size={10}/>
                                  </button>
                              </div>

                              {isOpen && (
                                  <div className="flex flex-col relative ml-3 border-l border-[var(--ui-border)] pl-1 my-1">
                                      {folderNotes.length === 0 ? (
                                          <div className="py-2 px-4 text-[10px] text-[var(--ui-text-muted)] italic opacity-50">Empty Folder</div>
                                      ) : (
                                          folderNotes.map(note => <NoteRow key={note.id} note={note} depth={0} />)
                                      )}
                                  </div>
                              )}
                          </div>
                      );
                  })}

                  {/* ROOT NOTES */}
                  {treeData.rootNotes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[var(--ui-border)]/50">
                          {treeData.rootNotes.map(note => <NoteRow key={note.id} note={note} />)}
                      </div>
                  )}
                  
                  {treeData.rootNotes.length === 0 && folders.length === 0 && !loading && (
                      <div className="text-center py-8 text-[var(--ui-text-muted)]">
                          <p className="text-xs">No notes found.</p>
                      </div>
                  )}
              </div>
          )}

          {/* === RECENT TAB === */}
          {activeTab === 'recent' && (
              <div className="space-y-4">
                  {groupedNotes.map(group => (
                      <div key={group.title}>
                          <div 
                             onClick={() => setCollapsedGroups(prev => ({...prev, [group.title]: !prev[group.title]}))}
                             className="flex items-center gap-2 mb-1 px-2 cursor-pointer opacity-70 hover:opacity-100"
                          >
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--ui-text-muted)]">{group.title}</span>
                              <div className="h-[1px] flex-1 bg-[var(--ui-border)]"></div>
                          </div>
                          {!collapsedGroups[group.title] && (
                              <div className="space-y-0.5">
                                  {group.notes.map(note => <NoteRow key={note.id} note={note} />)}
                              </div>
                          )}
                      </div>
                  ))}
              </div>
          )}
       </div>
    </div>
  );
};

export default FileSystem;
