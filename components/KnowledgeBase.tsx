
import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, RefreshCw, FileText, Trash2, Cloud,
  UploadCloud, Grid, List as ListIcon, File
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { LibraryMaterial } from '../types';
import { extractTextFromFile } from '../utils/pdfExtractor';

const KnowledgeBase: React.FC = () => {
  const [cloudMaterials, setCloudMaterials] = useState<LibraryMaterial[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const storage = StorageService.getInstance();
  const isCloudMode = storage.isCloudReady();

  useEffect(() => { loadData(); }, [isCloudMode]);

  const loadData = async () => {
    if (isCloudMode) {
      try {
        const materials = await storage.getLibraryMaterials();
        setCloudMaterials(materials);
      } catch (e) { console.error(e); }
    }
  };

  const handleLocalUploadClick = () => {
      if(!isCloudMode) return alert("Please connect to Supabase (Cloud) in Settings to upload.");
      fileInputRef.current?.click();
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files: File[] = Array.from(e.target.files);
          setIsProcessing(true);
          try {
              for (const file of files) {
                  let contentToSave = "";
                  let fileType = file.type || 'application/octet-stream';
                  let processedStatus = "Raw upload";

                  // SMART EXTRACTION: If PDF/Text, extract text content to save space
                  if (file.type === 'application/pdf' || file.name.endsWith('.pdf') || file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
                      try {
                          const text = await extractTextFromFile(file);
                          // Store as Base64 Text
                          contentToSave = btoa(unescape(encodeURIComponent(text)));
                          fileType = 'text/plain'; // Treat as text for AI
                          processedStatus = "Extracted Text";
                      } catch (extractError) {
                          console.warn("Extraction failed, falling back to raw", extractError);
                          if (file.size > 1.5 * 1024 * 1024) {
                              alert(`File "${file.name}" extraction failed and is too large for raw upload.`);
                              continue;
                          }
                          contentToSave = await readFileAsBase64(file);
                      }
                  } else {
                      // Binary files (Images, etc) - Strict Limit
                      if (file.size > 2 * 1024 * 1024) {
                          alert(`Image/Binary file "${file.name}" is too large (>2MB).`);
                          continue;
                      }
                      contentToSave = await readFileAsBase64(file);
                  }
                  
                  const newMaterial: LibraryMaterial = {
                      id: crypto.randomUUID(),
                      title: file.name,
                      file_type: fileType,
                      content: contentToSave,
                      processed_content: processedStatus, 
                      tags: ['uploaded', processedStatus === "Extracted Text" ? 'extracted' : 'raw'],
                      size: file.size
                  };
                  
                  await storage.saveLibraryMaterial(newMaterial);
              }
              await loadData();
          } catch (error: any) { 
              if (error.name === 'QuotaExceededError') {
                  alert("Browser Storage Full. (Local Fallback Failed)");
              } else if (error.message?.includes("413")) {
                  alert("Payload too large for database.");
              } else {
                  alert("Upload Failed: " + error.message); 
              }
          } 
          finally { setIsProcessing(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
      }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
              const result = reader.result as string;
              resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
      });
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm("Remove this material from Cloud?")) {
          await storage.deleteLibraryMaterial(id);
          loadData();
      }
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedFiles);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedFiles(newSet);
  };

  // --- RENDER ---
  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in bg-[var(--ui-bg)]">
      
      {/* Header */}
      <div className="p-6 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div>
            <h2 className="text-2xl font-bold text-[var(--ui-text-main)] flex items-center gap-2">
               <Database className="text-[var(--ui-primary)]" /> Knowledge Library
            </h2>
            <p className="text-[var(--ui-text-muted)] text-sm mt-1 flex items-center gap-2">
               {isCloudMode ? <span className="text-green-500 flex items-center gap-1"><Cloud size={12}/> Connected to Supabase</span> : <span className="text-amber-500">Offline Mode (Connect Supabase for Library)</span>}
            </p>
         </div>

         <div className="flex items-center gap-3">
             <div className="flex bg-[var(--ui-bg)] rounded-lg p-1 border border-[var(--ui-border)]">
                 <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)]'}`}><Grid size={16}/></button>
                 <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)]'}`}><ListIcon size={16}/></button>
             </div>
             
             <button 
                onClick={handleLocalUploadClick}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-bold shadow-lg transition-all ${isCloudMode ? 'bg-[var(--ui-primary)] hover:opacity-90' : 'bg-gray-400 cursor-not-allowed'}`}
             >
                {isProcessing ? <RefreshCw className="animate-spin" size={16}/> : <UploadCloud size={16}/>}
                <span>Upload</span>
             </button>
             <input type="file" ref={fileInputRef} onChange={handleLocalFileChange} className="hidden" multiple accept=".pdf,.txt,.md"/>
         </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          
          {!isCloudMode ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--ui-text-muted)] border-2 border-dashed border-[var(--ui-border)] rounded-2xl">
                  <div className="w-16 h-16 bg-[var(--ui-surface)] rounded-full flex items-center justify-center mb-4"><Cloud size={32} className="opacity-20"/></div>
                  <p>Library features require a Supabase Connection.</p>
              </div>
          ) : cloudMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--ui-text-muted)] border-2 border-dashed border-[var(--ui-border)] rounded-2xl">
                  <div className="w-16 h-16 bg-[var(--ui-surface)] rounded-full flex items-center justify-center mb-4"><FileText size={32} className="opacity-20"/></div>
                  <p>Library is empty. Upload PDFs (Text Extracted) or Docs.</p>
              </div>
          ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {cloudMaterials.map(item => (
                      <div 
                        key={item.id}
                        onClick={() => toggleSelection(item.id)}
                        className={`
                            relative group p-4 rounded-xl border transition-all cursor-pointer flex flex-col items-center text-center gap-3
                            ${selectedFiles.has(item.id) 
                                ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)] ring-1 ring-[var(--ui-primary)]' 
                                : 'bg-[var(--ui-surface)] border-[var(--ui-border)] hover:border-[var(--ui-text-muted)] hover:shadow-md'}
                        `}
                      >
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-1 ${selectedFiles.has(item.id) ? 'bg-[var(--ui-primary)] text-white' : 'bg-[var(--ui-bg)] text-[var(--ui-text-muted)]'}`}>
                              <File size={24} />
                          </div>
                          
                          <div className="w-full">
                              <h3 className="text-sm font-bold text-[var(--ui-text-main)] truncate w-full">{item.title}</h3>
                              <p className="text-[10px] text-[var(--ui-text-muted)] mt-1 uppercase tracking-wide">
                                  {item.file_type.split('/')[1] || 'FILE'} • {(item.size ? (item.size/1024).toFixed(0) : 0)} KB
                              </p>
                          </div>

                          <button 
                             onClick={(e) => handleDeleteItem(item.id, e)} 
                             className="absolute top-2 right-2 p-1.5 bg-[var(--ui-bg)] text-red-400 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                          >
                              <Trash2 size={12}/>
                          </button>
                      </div>
                  ))}
              </div>
          ) : (
              <div className="flex flex-col gap-2">
                  {cloudMaterials.map(item => (
                      <div 
                        key={item.id}
                        onClick={() => toggleSelection(item.id)}
                        className={`
                            flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all
                            ${selectedFiles.has(item.id) ? 'bg-[var(--ui-primary-glow)] border-[var(--ui-primary)]' : 'bg-[var(--ui-surface)] border-[var(--ui-border)] hover:bg-[var(--ui-bg)]'}
                        `}
                      >
                          <div className="flex items-center gap-3 overflow-hidden">
                              <File size={16} className={selectedFiles.has(item.id) ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}/>
                              <span className="text-sm font-medium text-[var(--ui-text-main)] truncate">{item.title}</span>
                          </div>
                          <div className="flex items-center gap-4">
                              <span className="text-[10px] text-[var(--ui-text-muted)] font-mono">{(item.size ? (item.size/1024).toFixed(0) : 0)} KB</span>
                              <button onClick={(e) => handleDeleteItem(item.id, e)} className="text-[var(--ui-text-muted)] hover:text-red-500"><Trash2 size={14}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          )}
          
      </div>
    </div>
  );
};

export default KnowledgeBase;
