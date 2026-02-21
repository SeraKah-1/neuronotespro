
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Move, ZoomIn, ZoomOut, Maximize, MousePointer2, 
  Map, LayoutGrid, X, Edit3, Save, Info 
} from 'lucide-react';
import Mermaid from './Mermaid';
import DiagramBuilder from './DiagramBuilder';

interface SpatialCanvasProps {
  content: string;
  onClose: () => void;
  onUpdateNote?: (newContent: string) => void;
}

interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  content: string;
  type: 'markdown' | 'mermaid' | 'title';
  originalIndex: number; // To reconstruct Markdown later
}

interface Connection {
  from: string;
  to: string;
}

const BLOCK_WIDTH = 450;
const GAP_X = 500;
const GAP_Y = 50;

const SpatialCanvas: React.FC<SpatialCanvasProps> = ({ content, onClose, onUpdateNote }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  
  // Interaction State
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  
  // Diagram Editor State
  const [editingDiagram, setEditingDiagram] = useState<{ id: string, code: string } | null>(null);

  // --- PARSER: MARKDOWN TO SPATIAL NODES ---
  useEffect(() => {
    // 1. Split content by Headers (H1 or H2) to create logical chunks
    const lines = content.split('\n');
    const newNodes: Node[] = [];
    const newConnections: Connection[] = [];
    
    let currentBlock: string[] = [];
    let currentId = `node-0`;
    let blockCount = 0;
    
    // Add Main Title as first node if exists
    // (Simplification: We treat the first chunk as the start)

    const flushBlock = (type: 'markdown' | 'mermaid' = 'markdown') => {
        if (currentBlock.length === 0) return;
        
        const text = currentBlock.join('\n');
        // Check if block is purely a mermaid diagram
        const isMermaid = text.trim().startsWith('```mermaid') || type === 'mermaid';
        
        newNodes.push({
            id: currentId,
            x: (blockCount % 3) * GAP_X, // Grid Layout 3 columns
            y: Math.floor(blockCount / 3) * 600, // Estimate height
            w: BLOCK_WIDTH,
            content: text,
            type: isMermaid ? 'mermaid' : 'markdown',
            originalIndex: blockCount
        });
        
        // Auto connect to previous
        if (blockCount > 0) {
            newConnections.push({ from: `node-${blockCount-1}`, to: currentId });
        }
        
        blockCount++;
        currentId = `node-${blockCount}`;
        currentBlock = [];
    };

    lines.forEach(line => {
        // Detect Header Split
        if (line.match(/^#{1,2}\s/)) {
            flushBlock(); // Save previous
            currentBlock.push(line);
        } 
        // Detect Mermaid Block Start
        else if (line.trim().startsWith('```mermaid')) {
            flushBlock(); // Save text before diagram
            currentBlock.push(line);
        }
        // Detect Mermaid Block End
        else if (line.trim() === '```' && currentBlock.length > 0 && currentBlock[0].startsWith('```mermaid')) {
            currentBlock.push(line);
            flushBlock('mermaid'); // Save diagram immediately
        }
        else {
            currentBlock.push(line);
        }
    });
    flushBlock(); // Final flush

    // Center the initial view
    const bounds = newNodes.length > 0 ? newNodes[0] : { x: 0, y: 0 };
    setTransform(prev => ({ ...prev, x: window.innerWidth/2 - bounds.x - 200, y: 100 }));
    
    setNodes(newNodes);
    setConnections(newConnections);
  }, [content]);

  // --- INTERACTION HANDLERS ---

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.2, transform.scale + delta), 2);
        setTransform(prev => ({ ...prev, scale: newScale }));
    } else {
        // Pan with scroll if not zooming
        setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicking background, pan canvas
    if (e.button === 0 || e.button === 1) { // Left or Middle
        setIsDraggingCanvas(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDraggingNodeId(id);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      if (isDraggingCanvas) {
          setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      } else if (draggingNodeId) {
          const scaledDx = dx / transform.scale;
          const scaledDy = dy / transform.scale;
          
          setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: n.x + scaledDx, y: n.y + scaledDy } : n));
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
  };

  const handleMouseUp = () => {
      setIsDraggingCanvas(false);
      setDraggingNodeId(null);
  };

  const handleDiagramSave = (newCode: string) => {
      if (!editingDiagram) return;
      
      const newNodes = nodes.map(n => n.id === editingDiagram.id ? { ...n, content: `\`\`\`mermaid\n${newCode}\n\`\`\`` } : n);
      setNodes(newNodes);
      setEditingDiagram(null);
      
      // OPTIONAL: Reconstruct full markdown and save back to main app
      // const fullContent = newNodes.sort((a,b) => a.originalIndex - b.originalIndex).map(n => n.content).join('\n\n');
      // if (onUpdateNote) onUpdateNote(fullContent);
  };

  // --- RENDER HELPERS ---
  
  // Calculate Connection Lines
  const renderConnections = useMemo(() => {
      return connections.map((conn, idx) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          // Simple Center-to-Center logic for now
          // (Refinement: Connect closest edges)
          const startX = fromNode.x + fromNode.w / 2;
          const startY = fromNode.y + 100; // Approx height center
          const endX = toNode.x + toNode.w / 2;
          const endY = toNode.y + 100;

          return (
              <line 
                key={`${conn.from}-${conn.to}`} 
                x1={startX} y1={startY} 
                x2={endX} y2={endY} 
                stroke="var(--ui-border)" 
                strokeWidth="2" 
                strokeDasharray="5,5"
              />
          );
      });
  }, [nodes, connections]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a] overflow-hidden flex flex-col font-sans text-slate-200">
        
        {/* TOP BAR */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-black/50 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 z-50 pointer-events-auto">
            <div className="flex items-center gap-3">
                <Map className="text-cyan-400" size={20}/>
                <h2 className="font-bold text-sm tracking-widest uppercase text-white">NeuroMap <span className="text-xs text-slate-500 ml-2">Spatial Architect</span></h2>
            </div>
            
            <div className="flex items-center gap-4 bg-black/40 rounded-full px-4 py-1 border border-white/10">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <MousePointer2 size={12}/> <span>Drag to Move</span>
                </div>
                <div className="w-[1px] h-3 bg-white/10"></div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <LayoutGrid size={12}/> <span>Scroll to Zoom</span>
                </div>
            </div>

            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                <X size={20}/>
            </button>
        </div>

        {/* INFINITE CANVAS */}
        <div 
            className={`flex-1 relative cursor-${isDraggingCanvas ? 'grabbing' : 'grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
        >
            <div 
                className="absolute origin-top-left transition-transform duration-75"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
                {/* SVG LAYER (Connections) */}
                <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1 }}>
                    {renderConnections}
                </svg>

                {/* HTML LAYER (Nodes) */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        className="absolute flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 group"
                        style={{ 
                            left: node.x, 
                            top: node.y, 
                            width: node.w,
                            // Dynamic height based on content, but capped
                            maxHeight: 800
                        }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    >
                        {/* Drag Handle */}
                        <div className="h-6 bg-slate-100 border-b border-slate-200 cursor-grab active:cursor-grabbing flex items-center justify-center">
                            <div className="w-12 h-1 bg-slate-300 rounded-full"></div>
                        </div>

                        {/* Content */}
                        <div className="p-5 overflow-y-auto custom-scrollbar bg-white text-slate-800 text-sm">
                            {node.type === 'mermaid' ? (
                                <div className="relative">
                                    <div className="pointer-events-none">
                                        <Mermaid chart={node.content.replace(/```mermaid/g, '').replace(/```/g, '')} />
                                    </div>
                                    <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-auto">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingDiagram({ id: node.id, code: node.content.replace(/```mermaid/g, '').replace(/```/g, '') }); }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 transform hover:scale-105 transition-all"
                                        >
                                            <Edit3 size={14}/> Edit Diagram
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="markdown-body prose prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                        {node.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* EDITOR OVERLAY */}
        {editingDiagram && (
            <DiagramBuilder 
                initialCode={editingDiagram.code}
                onClose={() => setEditingDiagram(null)}
                onSave={handleDiagramSave}
            />
        )}

    </div>
  );
};

export default SpatialCanvas;
