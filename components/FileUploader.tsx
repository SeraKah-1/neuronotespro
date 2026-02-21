
import React, { useRef, useState } from 'react';
import { Upload, X, FileText, File as FileIcon, Image as ImageIcon, Link, Globe, CloudLightning, Presentation, FileType } from 'lucide-react';
import { UploadedFile } from '../types';
import { extractTextFromFile } from '../utils/pdfExtractor';

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

type InputMode = 'local' | 'drive';

const FileUploader: React.FC<FileUploaderProps> = ({ files, onFilesChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<InputMode>('local');
  const [driveUrl, setDriveUrl] = useState('');
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [statusMessage, setStatusMessage] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  
  // NEW: Magic Toggle State
  const [makeToken, setMakeToken] = useState(true);

  // --- DRIVE UTILS ---
  const extractDriveId = (url: string): string | null => {
      const patterns = [
          /\/d\/([a-zA-Z0-9_-]+)/,
          /id=([a-zA-Z0-9_-]+)/,
          /open\?id=([a-zA-Z0-9_-]+)/
      ];
      
      for (const p of patterns) {
          const match = url.match(p);
          if (match && match[1]) return match[1];
      }
      return null;
  };

  const handleDriveImport = async () => {
      if (!driveUrl) return;
      setLinkError(null);
      
      const fileId = extractDriveId(driveUrl);
      if (!fileId) {
          setLinkError("Invalid Google Drive Link.");
          return;
      }

      setIsProcessing(true);
      setUploadProgress(20);
      setStatusMessage("Resolving Link...");

      try {
          await new Promise(r => setTimeout(r, 600)); // Simulating faster processing
          setUploadProgress(80);

          const mockContent = `[SYSTEM: LINKED DRIVE FILE]\nFile ID: ${fileId}\nURL: ${driveUrl}`;
          const base64Data = btoa(mockContent);

          const newFile: UploadedFile = {
              name: `GDrive_${fileId.substring(0,6)}...`,
              mimeType: 'application/vnd.google-apps.file',
              data: base64Data,
              isTokenized: makeToken
          };

          setUploadProgress(100);
          onFilesChange([...files, newFile]);
          setDriveUrl('');
          setStatusMessage("Linked!");
          await new Promise(r => setTimeout(r, 300));

      } catch (e) {
          setLinkError("Failed to fetch link.");
      } finally {
          setIsProcessing(false);
          setUploadProgress(0);
          setStatusMessage('');
      }
  };

  // --- LOCAL FILE HANDLERS ---
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!isProcessing) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (isProcessing || inputMode !== 'local') return;
    if (e.dataTransfer.files?.length > 0) processFiles(Array.from(e.dataTransfer.files));
  };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) processFiles(Array.from(e.target.files));
    if (e.target) e.target.value = '';
  };

  const processFiles = async (fileList: File[]) => {
    setIsProcessing(true);
    setUploadProgress(0);
    const newFiles: UploadedFile[] = [];

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        // Faster visual feedback for large files
        setUploadProgress(10);

        try {
          let finalData = '';
          let mimeType = file.type;

          // SMART INGESTION: Extract Text from PDF/Text
          if (ext === 'pdf' || ext === 'txt' || ext === 'md' || ext === 'json') {
              setStatusMessage(`Extracting Text from ${file.name}...`);
              const textContent = await extractTextFromFile(file);
              
              // Encode text as Base64 to match expected format for "data"
              finalData = btoa(unescape(encodeURIComponent(textContent)));
              mimeType = 'text/plain'; // Correctly mark as text
          } else {
              setStatusMessage(`Reading ${file.name}...`);
              finalData = await readFileAsBase64(file);
          }
          
          setUploadProgress(100);
          
          // Fix MIME types for common issues
          if (ext === 'md' || ext === 'txt') mimeType = 'text/plain';
          if (!mimeType && ext === 'ppt') mimeType = 'application/vnd.ms-powerpoint';
          if (!mimeType && ext === 'pptx') mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          if (!mimeType) mimeType = 'application/octet-stream';

          newFiles.push({
            name: file.name,
            mimeType: mimeType,
            data: finalData,
            isTokenized: makeToken
          });

        } catch (err) {
          console.error(`Failed ${file.name}`, err);
          alert(`Failed to process ${file.name}. If it's a large PDF, try splitting it.`);
        }
      }
      
      setUploadProgress(100);
      setStatusMessage("Done");
      await new Promise(r => setTimeout(r, 200)); 

      if (newFiles.length > 0) onFilesChange([...files, ...newFiles]);
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
      setStatusMessage('');
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Optimization: Handle large strings better by not splitting if not needed immediately
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const getFileIcon = (mimeType: string, name: string) => {
    const lowerName = name.toLowerCase();
    if (mimeType.includes('pdf')) return <FileText size={16} className="text-red-400" />;
    if (mimeType.includes('image')) return <ImageIcon size={16} className="text-purple-400" />;
    if (mimeType.includes('presentation') || lowerName.endsWith('ppt') || lowerName.endsWith('pptx')) return <Presentation size={16} className="text-orange-400" />;
    if (mimeType.includes('google')) return <Link size={16} className="text-blue-400" />;
    return <FileIcon size={16} className="text-gray-400" />;
  };

  return (
    <div className="w-full space-y-3">
      {/* MINIMALIST TABS */}
      <div className="flex bg-[var(--ui-bg)] p-0.5 rounded-lg border border-[var(--ui-border)] w-full">
          <button onClick={() => setInputMode('local')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${inputMode === 'local' ? 'bg-[var(--ui-surface)] text-[var(--ui-text-main)] shadow-sm' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}>
             <Upload size={12}/> Local
          </button>
          <button onClick={() => setInputMode('drive')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${inputMode === 'drive' ? 'bg-[var(--ui-surface)] text-[var(--ui-text-main)] shadow-sm' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}>
             <Link size={12}/> Drive
          </button>
      </div>

      {/* DROPZONE */}
      <div 
        onClick={() => !isProcessing && inputMode === 'local' && inputRef.current?.click()}
        onDragEnter={handleDragEnter} onDragOver={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop}
        className={`
          relative overflow-hidden rounded-xl border border-dashed p-4 flex flex-col items-center justify-center transition-all duration-200 group min-h-[100px]
          ${isProcessing ? 'border-[var(--ui-primary)]/50 bg-[var(--ui-primary)]/5 cursor-wait' 
            : isDragging ? 'border-[var(--ui-primary)] bg-[var(--ui-primary)]/10 scale-[1.01]' 
            : 'border-[var(--ui-border)] bg-[var(--ui-bg)] hover:bg-[var(--ui-surface)] hover:border-[var(--ui-text-muted)]'}
          ${inputMode === 'local' ? 'cursor-pointer' : 'cursor-default'}
        `}
      >
        {isProcessing ? (
           <div className="flex flex-col items-center w-full max-w-[150px]">
              <div className="flex justify-between w-full text-[10px] font-bold text-[var(--ui-text-muted)] mb-1">
                  <span>{statusMessage}</span>
                  <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-[var(--ui-border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--ui-primary)] transition-all duration-200" style={{ width: `${uploadProgress}%` }}></div>
              </div>
           </div>
        ) : inputMode === 'local' ? (
           <>
              <div className="flex items-center gap-2 text-[var(--ui-text-muted)] group-hover:text-[var(--ui-primary)] transition-colors">
                <Upload size={20} />
                <span className="text-xs font-medium">Click or Drop Files</span>
              </div>
              <p className="text-[9px] text-[var(--ui-text-muted)] mt-1 opacity-70">PDF, PPTX, Images (Large Supported)</p>
           </>
        ) : (
           <div className="w-full max-w-sm flex items-center gap-2 animate-fade-in">
              <div className="flex-1 relative">
                  <Globe size={12} className="absolute left-2.5 top-2.5 text-[var(--ui-text-muted)]"/>
                  <input type="text" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="Google Drive Link" className="w-full bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg p-2 pl-8 text-xs text-[var(--ui-text-main)] outline-none focus:border-[var(--ui-primary)]"/>
              </div>
              <button onClick={handleDriveImport} disabled={!driveUrl} className="p-2 bg-[var(--ui-primary)] hover:opacity-90 text-white rounded-lg disabled:opacity-50">
                 <CloudLightning size={14}/>
              </button>
           </div>
        )}
        <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" multiple accept=".pdf,.md,.txt,.jpg,.jpeg,.png,.webp,.ppt,.pptx" disabled={isProcessing}/>
      </div>
      {linkError && <span className="text-[10px] text-red-500 block text-center">{linkError}</span>}

      {/* FILE LIST (Compact) */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-1">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between bg-[var(--ui-surface)] border border-[var(--ui-border)] p-2 rounded-lg group hover:border-[var(--ui-text-muted)] transition-all">
              <div className="flex items-center gap-2 overflow-hidden">
                {getFileIcon(file.mimeType, file.name)}
                <span className="text-[var(--ui-text-main)] text-xs truncate max-w-[180px]">{file.name}</span>
                <span className="text-[9px] text-[var(--ui-text-muted)] uppercase bg-[var(--ui-bg)] px-1 rounded border border-[var(--ui-border)]">
                    {file.name.split('.').pop()}
                </span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} disabled={isProcessing} className="text-[var(--ui-text-muted)] hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
