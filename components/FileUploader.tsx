
import React, { useRef, useState } from 'react';
import { Upload, X, FileText, File as FileIcon, Image as ImageIcon, Presentation } from 'lucide-react';
import { UploadedFile } from '../types';

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ files, onFilesChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [statusMessage, setStatusMessage] = useState('');
  
  // NEW: Magic Toggle State
  const [makeToken, setMakeToken] = useState(true);

  // --- LOCAL FILE HANDLERS ---
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!isProcessing) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (isProcessing) return;
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
        setStatusMessage(`Reading ${file.name}...`);
        
        // Faster visual feedback for large files
        setUploadProgress(30);

        try {
          const base64Data = await readFileAsBase64(file);
          setUploadProgress(80);
          
          let mimeType = file.type;
          const ext = file.name.split('.').pop()?.toLowerCase();

          // Fix MIME types for common issues
          if (ext === 'md' || ext === 'txt') mimeType = 'text/plain';
          if (!mimeType && ext === 'ppt') mimeType = 'application/vnd.ms-powerpoint';
          if (!mimeType && ext === 'pptx') mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          if (!mimeType) mimeType = 'application/octet-stream';

          newFiles.push({
            name: file.name,
            mimeType: mimeType,
            data: base64Data,
            isTokenized: makeToken
          });

        } catch (err) {
          console.error(`Failed ${file.name}`, err);
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
    return <FileIcon size={16} className="text-gray-400" />;
  };

  return (
    <div className="w-full space-y-3">
      {/* DROPZONE */}
      <div 
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragEnter={handleDragEnter} onDragOver={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop}
        className={`
          relative overflow-hidden rounded-xl border border-dashed p-4 flex flex-col items-center justify-center transition-all duration-200 group min-h-[100px]
          ${isProcessing ? 'border-[var(--ui-primary)]/50 bg-[var(--ui-primary)]/5 cursor-wait' 
            : isDragging ? 'border-[var(--ui-primary)] bg-[var(--ui-primary)]/10 scale-[1.01]' 
            : 'border-[var(--ui-border)] bg-[var(--ui-bg)] hover:bg-[var(--ui-surface)] hover:border-[var(--ui-text-muted)]'}
          cursor-pointer
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
        ) : (
           <>
              <div className="flex items-center gap-2 text-[var(--ui-text-muted)] group-hover:text-[var(--ui-primary)] transition-colors">
                <Upload size={20} />
                <span className="text-xs font-medium">Click or Drop Files</span>
              </div>
              <p className="text-[9px] text-[var(--ui-text-muted)] mt-1 opacity-70">PDF, PPTX, Images (Large Supported)</p>
           </>
        )}
        <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" multiple accept=".pdf,.md,.txt,.jpg,.jpeg,.png,.webp,.ppt,.pptx" disabled={isProcessing}/>
      </div>

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
