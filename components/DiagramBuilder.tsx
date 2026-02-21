
import React, { useState, useEffect, useCallback } from 'react';
import { Edit3, Check, RotateCcw, X, Type, BoxSelect } from 'lucide-react';
import Mermaid from './Mermaid';

interface DiagramBuilderProps {
  initialCode: string;
  onClose: () => void;
  onSave: (newCode: string) => void;
}

interface NodeItem {
  id: string;
  originalLabel: string;
  currentLabel: string;
  shapeOpen: string;  // e.g., [, (, ((
  shapeClose: string; // e.g., ], ), ))
  fullMatch: string;  // Original string for replacement
}

const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ initialCode, onClose, onSave }) => {
  const [code, setCode] = useState(initialCode);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // --- PARSER ENGINE ---
  // Parses Mermaid code to find editable nodes like: id[Label] or id("Label")
  const parseNodes = useCallback((sourceCode: string) => {
    const foundNodes: NodeItem[] = [];
    // Regex explanation:
    // ([a-zA-Z0-9_]+)   -> Capture Group 1: ID (alphanumeric + underscore)
    // \s*               -> Optional whitespace
    // ([\[\(\{\>]+)     -> Capture Group 2: Opening bracket(s) e.g. [, ((, {
    // \s*["']?          -> Optional quote
    // (.*?)             -> Capture Group 3: The Label Content (Non-greedy)
    // ["']?\s*          -> Optional closing quote
    // ([\]\)\}\>]+)     -> Capture Group 4: Closing bracket(s)
    const regex = /([a-zA-Z0-9_]+)\s*([\[\(\{\>]+)\s*["']?(.*?)["']?\s*([\]\)\}\>]+)/g;
    
    let match;
    while ((match = regex.exec(sourceCode)) !== null) {
      // Filter out style definitions or clicks which might look like nodes
      if (!match[0].startsWith('style') && !match[0].startsWith('classDef')) {
          foundNodes.push({
            id: match[1],
            shapeOpen: match[2],
            originalLabel: match[3],
            currentLabel: match[3],
            shapeClose: match[4],
            fullMatch: match[0]
          });
      }
    }
    setNodes(foundNodes);
  }, []);

  useEffect(() => {
    parseNodes(initialCode);
  }, [initialCode, parseNodes]);

  // --- UPDATE LOGIC ---
  const handleLabelChange = (index: number, newLabel: string) => {
    const updatedNodes = [...nodes];
    updatedNodes[index].currentLabel = newLabel;
    setNodes(updatedNodes);
    
    // Regenerate Code immediately for preview
    let newCode = initialCode;
    // We need to replace systematically. 
    // WARNING: Simple replaceAll might break if multiple nodes look identical.
    // Ideally we reconstruct, but for this lightweight editor, we iterate carefully.
    
    // To avoid collision, we replace based on the captured ID + Shape structure in the original string
    updatedNodes.forEach(node => {
        // Construct new node string: id["New Label"]
        // We ensure quotes are added if label contains spaces or special chars
        const safeLabel = `"${node.currentLabel.replace(/"/g, "'")}"`; 
        const replacement = `${node.id}${node.shapeOpen}${safeLabel}${node.shapeClose}`;
        
        // We use the original full match to find and replace. 
        // This is a bit fragile if duplicates exist, but Mermaid IDs should be unique per node definition.
        newCode = newCode.replace(node.fullMatch, replacement);
    });
    setCode(newCode);
  };

  const handleReset = () => {
    setCode(initialCode);
    parseNodes(initialCode);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--ui-bg)] border-l border-[var(--ui-border)] w-full md:w-[400px] shadow-2xl absolute right-0 top-0 bottom-0 z-50 animate-slide-in-right">
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--ui-border)] bg-[var(--ui-sidebar)]">
            <div className="flex items-center gap-2">
                <div className="bg-purple-100 text-purple-600 p-2 rounded-lg">
                    <Edit3 size={18}/>
                </div>
                <div>
                    <h3 className="font-bold text-sm text-[var(--ui-text-main)]">Diagram Editor</h3>
                    <p className="text-[10px] text-[var(--ui-text-muted)]">{nodes.length} Editable Nodes Found</p>
                </div>
            </div>
            <div className="flex gap-1">
                <button onClick={handleReset} className="p-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)] rounded" title="Reset">
                    <RotateCcw size={16}/>
                </button>
                <button onClick={onClose} className="p-2 text-[var(--ui-text-muted)] hover:text-red-500 hover:bg-[var(--ui-bg)] rounded" title="Close">
                    <X size={16}/>
                </button>
            </div>
        </div>

        {/* BODY */}
        <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* 1. NODE LIST (Form) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-[var(--ui-bg)]">
                {nodes.length === 0 ? (
                    <div className="text-center text-[var(--ui-text-muted)] py-10">
                        <BoxSelect size={32} className="mx-auto mb-2 opacity-20"/>
                        <p className="text-xs">No text nodes detected.<br/>Try a simpler diagram.</p>
                    </div>
                ) : (
                    nodes.map((node, idx) => (
                        <div 
                            key={`${node.id}-${idx}`}
                            className={`group relative transition-all ${activeNodeId === node.id ? 'opacity-100' : 'opacity-100'}`}
                            onFocus={() => setActiveNodeId(node.id)}
                        >
                            <label className="text-[9px] font-bold text-[var(--ui-text-muted)] uppercase mb-1 flex items-center gap-1">
                                <span className="bg-[var(--ui-surface)] border border-[var(--ui-border)] px-1 rounded">{node.id}</span>
                                {node.originalLabel !== node.currentLabel && <span className="text-[var(--ui-primary)]">• Modified</span>}
                            </label>
                            <div className="relative">
                                <Type size={12} className="absolute left-3 top-3 text-[var(--ui-text-muted)]"/>
                                <textarea
                                    value={node.currentLabel}
                                    onChange={(e) => handleLabelChange(idx, e.target.value)}
                                    className="w-full bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg py-2 pl-8 pr-3 text-xs text-[var(--ui-text-main)] focus:border-[var(--ui-primary)] focus:ring-1 focus:ring-[var(--ui-primary)]/20 outline-none transition-all resize-none h-16 shadow-sm"
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 2. MINI PREVIEW */}
            <div className="h-48 border-t border-[var(--ui-border)] bg-[var(--ui-surface)] p-2 relative shrink-0">
                <div className="absolute top-2 left-2 z-10 bg-[var(--ui-bg)]/80 backdrop-blur px-2 py-1 rounded text-[9px] font-bold border border-[var(--ui-border)]">
                    LIVE PREVIEW
                </div>
                <div className="w-full h-full overflow-hidden opacity-80 zoom-50">
                    <Mermaid chart={code} />
                </div>
            </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-[var(--ui-border)] bg-[var(--ui-sidebar)] flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors">Cancel</button>
            <button 
                onClick={() => onSave(code)}
                className="px-6 py-2 bg-[var(--ui-primary)] hover:opacity-90 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all active:scale-95"
            >
                <Check size={14}/> Save Changes
            </button>
        </div>
    </div>
  );
};

export default DiagramBuilder;
