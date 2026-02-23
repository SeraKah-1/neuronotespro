import React from 'react';
import { X, Bot, Settings2, FileText, Sparkles, LayoutTemplate } from 'lucide-react';
import { AppModel, GenerationConfig, AIProvider, StorageService } from '../types';
import ContextManager from './ContextManager';

interface ContextSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: GenerationConfig;
  onConfigChange: (newConfig: GenerationConfig) => void;
  attachedContextIds: string[];
  onContextChange: (ids: string[]) => void;
  storageService: StorageService;
  onQuickAction: (action: 'summarize' | 'quiz') => void;
}

const ContextSidePanel: React.FC<ContextSidePanelProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange,
  attachedContextIds,
  onContextChange,
  storageService,
  onQuickAction
}) => {
  if (!isOpen) return null;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange({
      ...config,
      model: e.target.value
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-[var(--ui-surface)] border-l border-[var(--ui-border)] shadow-2xl z-[60] flex flex-col animate-slide-left">
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--ui-border)] bg-[var(--ui-bg)]">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[var(--ui-primary)]" />
          <h3 className="font-bold text-sm text-[var(--ui-text-main)]">Assistant Context</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[var(--ui-border)] rounded text-[var(--ui-text-muted)]">
          <X size={16} />
        </button>
      </div>

      {/* CONTENT SCROLL */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        
        {/* SECTION 1: MODEL SELECTOR */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-wider">
            <Settings2 size={12} />
            <span>AI Model</span>
          </div>
          <select 
            value={config.model}
            onChange={handleModelChange}
            className="w-full p-2 text-xs bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg outline-none focus:border-[var(--ui-primary)] text-[var(--ui-text-main)]"
          >
            <optgroup label="Gemini 3 (Preview)">
                <option value={AppModel.GEMINI_3_PRO}>{AppModel.GEMINI_3_PRO}</option>
                <option value={AppModel.GEMINI_3_FLASH}>{AppModel.GEMINI_3_FLASH}</option>
            </optgroup>
            <optgroup label="Gemini 2.5">
                <option value={AppModel.GEMINI_2_5_PRO}>{AppModel.GEMINI_2_5_PRO}</option>
                <option value={AppModel.GEMINI_2_5_FLASH}>{AppModel.GEMINI_2_5_FLASH}</option>
            </optgroup>
            <optgroup label="Groq (Llama/Mixtral)">
                <option value={AppModel.GROQ_LLAMA_3_3_70B}>{AppModel.GROQ_LLAMA_3_3_70B}</option>
                <option value={AppModel.GROQ_MIXTRAL_8X7B}>{AppModel.GROQ_MIXTRAL_8X7B}</option>
            </optgroup>
          </select>
          <p className="text-[10px] text-[var(--ui-text-muted)]">
            Selected model will be used for "Deepen", "Magic Edit", and Chat.
          </p>
        </div>

        <hr className="border-[var(--ui-border)]" />

        {/* SECTION 2: MICRO-RAG CONTEXT */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-wider">
            <FileText size={12} />
            <span>Micro-RAG Context</span>
          </div>
          <div className="bg-[var(--ui-bg)]/50 rounded-xl p-3 border border-[var(--ui-border)]">
             <ContextManager 
                attachedContextIds={attachedContextIds}
                onContextChange={onContextChange}
                storageService={storageService}
             />
             <p className="text-[10px] text-[var(--ui-text-muted)] mt-2 leading-relaxed">
               Upload PDF/PPT/TXT files here. They will be used as reference material when you use the <strong>Deepen</strong> feature.
             </p>
          </div>
        </div>

        <hr className="border-[var(--ui-border)]" />

        {/* SECTION 3: QUICK START TEMPLATES (Placeholder) */}
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-wider">
                <LayoutTemplate size={12} />
                <span>Quick Actions</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => onQuickAction('summarize')}
                  className="p-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg text-xs text-left hover:border-[var(--ui-primary)] transition-colors"
                >
                    <span className="block font-bold mb-1">Summarize</span>
                    <span className="text-[10px] text-[var(--ui-text-muted)]">Create a TL;DR</span>
                </button>
                <button 
                  onClick={() => onQuickAction('quiz')}
                  className="p-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg text-xs text-left hover:border-[var(--ui-primary)] transition-colors"
                >
                    <span className="block font-bold mb-1">Quiz Me</span>
                    <span className="text-[10px] text-[var(--ui-text-muted)]">Generate questions</span>
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};

export default ContextSidePanel;
