import React, { useState, useRef } from 'react';
import { Plus, X, FileText, Loader2, Link as LinkIcon } from 'lucide-react';
import { UploadedFile, LibraryMaterial } from '../types';
import { extractTextFromFile } from '../utils/pdfExtractor';
import { StorageService } from '../services/storageService';
import { processPPTWithGemini } from '../services/pptService';
import { GenerationConfig, AIProvider, NoteMode, StorageType } from '../types';

interface ContextManagerProps {
  attachedContextIds: string[];
  onContextChange: (ids: string[]) => void;
  storageService: StorageService;
}

const ContextManager: React.FC<ContextManagerProps> = ({ 
  attachedContextIds, 
  onContextChange,
  storageService 
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load material details on mount or when IDs change
  React.useEffect(() => {
    const loadMaterials = async () => {
      if (attachedContextIds.length > 0) {
        const mats = await storageService.getLibraryMaterialsByIds(attachedContextIds);
        setMaterials(mats);
      } else {
        setMaterials([]);
      }
    };
    loadMaterials();
  }, [attachedContextIds, storageService]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    setUploadStatus('Initializing...');

    try {
      const newIds: string[] = [...attachedContextIds];
      
      for (const file of Array.from(e.target.files)) {
        setUploadStatus(`Processing ${file.name}...`);
        
        // 1. Deduplication Check (Simple Name+Size)
        const existing = await storageService.findLibraryMaterialByHash(file.name, file.size);
        if (existing) {
          if (!newIds.includes(existing.id)) {
            newIds.push(existing.id);
          }
          continue;
        }

        // 2. Extract Text
        let textContent = "";
        const ext = file.name.split('.').pop()?.toLowerCase();

        if (ext === 'pdf' || ext === 'txt' || ext === 'md' || ext === 'json') {
             textContent = await extractTextFromFile(file);
        } else if (ext === 'ppt' || ext === 'pptx') {
             // Use Gemini Vision for PPT
             const reader = new FileReader();
             const base64 = await new Promise<string>((resolve) => {
                reader.onload = () => {
                    const res = reader.result as string;
                    resolve(res.includes(',') ? res.split(',')[1] : res);
                };
                reader.readAsDataURL(file);
             });
             
             // Temp Config
             const envKey = (import.meta as any).env?.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '');
             const tempConfig: GenerationConfig = {
                  provider: AIProvider.GEMINI,
                  model: 'gemini-2.5-flash',
                  temperature: 0.2,
                  apiKey: process.env.GEMINI_API_KEY || envKey || '',
                  mode: NoteMode.GENERAL,
                  storageType: StorageType.LOCAL
             };
             
             textContent = await processPPTWithGemini(tempConfig, {
                 name: file.name,
                 mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                 data: base64
             });
        } else {
            throw new Error("Unsupported file type for context");
        }

        // 3. Save to Library
        const newId = `lib-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newMaterial: LibraryMaterial = {
            id: newId,
            title: file.name,
            content: btoa(unescape(encodeURIComponent(textContent))), // Base64 store
            file_type: ext || 'unknown',
            size: file.size,
            tags: ['context-upload'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await storageService.saveLibraryMaterial(newMaterial);
        newIds.push(newId);
      }

      onContextChange(newIds);

    } catch (err: any) {
      console.error("Context Upload Error", err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeContext = (id: string) => {
    onContextChange(attachedContextIds.filter(cid => cid !== id));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {/* List Attached Contexts */}
      {materials.map(mat => (
        <div key={mat.id} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-[10px] font-medium animate-fade-in">
          <FileText size={10} />
          <span className="max-w-[100px] truncate">{mat.title}</span>
          <button onClick={() => removeContext(mat.id)} className="hover:text-red-500 ml-1">
            <X size={10} />
          </button>
        </div>
      ))}

      {/* Add Button */}
      <button 
        onClick={() => !isUploading && fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 px-2 py-1 rounded-full text-[10px] font-medium transition-colors disabled:opacity-50"
      >
        {isUploading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        {isUploading ? uploadStatus : "Add Context"}
      </button>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        multiple 
        accept=".pdf,.txt,.md,.ppt,.pptx"
      />
    </div>
  );
};

export default ContextManager;
