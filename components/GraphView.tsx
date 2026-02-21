
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { HistoryItem, NoteMode } from '../types';
import { StorageService } from '../services/storageService';
import { 
  Network, Search, ArrowRight, 
  Database, FileText, Zap, GraduationCap, PenTool, Library, Link2, Settings2, Unlock, Lock,
  Target, Crosshair, Activity, Scan
} from 'lucide-react';

interface GraphViewProps {
  onSelectNote: (note: HistoryItem) => void;
}

// --- LIGHTWEIGHT SIMILARITY ENGINE ---
const computeSimilarity = (a: HistoryItem, b: HistoryItem): number => {
    if (a.id === b.id) return 1;
    const tagsA = new Set(a.tags || []);
    const tagsB = new Set(b.tags || []);
    const intersection = new Set([...tagsA].filter(x => tagsB.has(x)));
    const union = new Set([...tagsA, ...tagsB]);
    const tagScore = union.size === 0 ? 0 : intersection.size / union.size;

    const tokenize = (str: string) => new Set(str.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const titleA = tokenize(a.topic);
    const titleB = tokenize(b.topic);
    const titleIntersect = new Set([...titleA].filter(x => titleB.has(x)));
    const titleScore = titleA.size === 0 ? 0 : titleIntersect.size / titleA.size;

    return (tagScore * 0.7) + (titleScore * 0.3);
};

const getModeColor = (mode: NoteMode) => {
  switch (mode) {
    case NoteMode.CHEAT_CODES: return { bg: 'bg-amber-500', border: 'border-amber-400', glow: 'shadow-amber-500/50', text: 'text-amber-400', ring: 'ring-amber-500' };
    case NoteMode.COMPREHENSIVE: return { bg: 'bg-emerald-600', border: 'border-emerald-400', glow: 'shadow-emerald-500/50', text: 'text-emerald-400', ring: 'ring-emerald-500' };
    case NoteMode.CUSTOM: return { bg: 'bg-pink-600', border: 'border-pink-400', glow: 'shadow-pink-500/50', text: 'text-pink-400', ring: 'ring-pink-500' };
    default: return { bg: 'bg-indigo-600', border: 'border-indigo-400', glow: 'shadow-indigo-500/50', text: 'text-indigo-400', ring: 'ring-indigo-500' };
  }
};

const getModeIcon = (mode: NoteMode) => {
  switch (mode) {
    case NoteMode.CHEAT_CODES: return <Zap size={14} />;
    case NoteMode.COMPREHENSIVE: return <Library size={14} />;
    case NoteMode.CUSTOM: return <PenTool size={14} />;
    default: return <GraduationCap size={14} />;
  }
};

const getOrbitPosition = (index: number, total: number, radius: number) => {
  const angle = (index / total) * 2 * Math.PI - (Math.PI / 2);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

const NeuralLattice: React.FC<GraphViewProps> = ({ onSelectNote }) => {
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<HistoryItem | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false); // UX FEEL: Warp State
  
  // UX Settings
  const [threshold, setThreshold] = useState(0.2); 
  const [autoConnect, setAutoConnect] = useState(true);
  const [maxOrbits, setMaxOrbits] = useState(8);

  const storage = StorageService.getInstance();

  const loadData = useCallback(async () => {
      setLoading(true);
      const data = await storage.getUnifiedNotes();
      const sorted = data.sort((a, b) => b.timestamp - a.timestamp);
      setNotes(sorted);
      if (sorted.length > 0 && !centerId) {
        setCenterId(sorted[0].id);
      }
      setLoading(false);
  }, [centerId, storage]);

  useEffect(() => { loadData(); }, []);

  // --- CONNECTIVITY LOGIC ---
  const { centerNode, satellites, otherNodes, connections } = useMemo(() => {
    if (!centerId || notes.length === 0) return { centerNode: null, satellites: [], otherNodes: [], connections: [] };

    const center = notes.find(n => n.id === centerId) || notes[0];
    
    const scoredNodes = notes
        .filter(n => n.id !== center.id)
        .map(n => {
            const similarity = computeSimilarity(center, n);
            const isManuallyLinked = n.tags?.some(t => center.tags?.includes(t)) || false;
            const finalScore = isManuallyLinked ? 1.1 : similarity;
            return { node: n, score: finalScore, isManual: isManuallyLinked };
        });

    const orbitCandidates = scoredNodes
        .filter(item => {
            const matchesSearch = search ? item.node.topic.toLowerCase().includes(search.toLowerCase()) : true;
            const passesThreshold = autoConnect ? item.score >= threshold : item.isManual;
            return matchesSearch && passesThreshold;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, maxOrbits);

    const satelliteNodes = orbitCandidates.map(i => i.node);
    
    const edges = orbitCandidates.map(item => ({
        targetId: item.node.id,
        type: item.isManual ? 'manual' : 'auto',
        strength: item.score
    }));

    const others = notes.filter(n => 
      n.id !== center.id && 
      !satelliteNodes.find(s => s.id === n.id) &&
      (search ? n.topic.toLowerCase().includes(search.toLowerCase()) : true)
    );

    return { centerNode: center, satellites: satelliteNodes, otherNodes: others, connections: edges };
  }, [notes, centerId, search, threshold, autoConnect, maxOrbits]);

  // --- ACTIONS WITH "FEELS" ---
  const handleNodeClick = (id: string) => {
    if (id === centerId) return; // Prevent clicking already active
    
    // 1. Trigger Warp Effect
    setIsTransitioning(true);
    
    // 2. Delay State Change (Allow animation to play)
    setTimeout(() => {
        setCenterId(id);
        setIsTransitioning(false);
    }, 400); // 400ms match CSS transition
  };

  const handleToggleLink = async (e: React.MouseEvent, target: HistoryItem) => {
      e.stopPropagation();
      if (!centerNode) return;
      storage.connectNotes(centerNode.id, target.id);
      loadData();
  };

  if (loading) return <div className="flex items-center justify-center h-full bg-[#050911] text-gray-500 animate-pulse"><Network size={48}/><span className="ml-3 font-mono">NEURAL SYNC...</span></div>;
  if (!centerNode) return <div className="flex items-center justify-center h-full bg-[#050911] text-gray-500">Neural Lattice Empty.</div>;

  const centerColors = getModeColor(centerNode.mode);

  return (
    <div className="flex h-full bg-[#050911] relative overflow-hidden font-sans text-white select-none">
      
      {/* --- CONTROLS HUD --- */}
      <div className="absolute top-4 left-4 z-30 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl w-64 shadow-2xl transition-opacity duration-300 hover:opacity-100 opacity-80">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-2">
              <Settings2 size={12}/> Synaptic Tuner
          </div>
          
          <div className="space-y-4">
              <div className="flex items-center justify-between group">
                  <span className="text-[10px] text-gray-400 group-hover:text-white transition-colors">Auto-Connect</span>
                  <button onClick={() => setAutoConnect(!autoConnect)} className={`w-8 h-4 rounded-full relative transition-colors ${autoConnect ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoConnect ? 'left-4.5' : 'left-0.5'}`}></div>
                  </button>
              </div>

              {autoConnect && (
                  <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-gray-500">
                          <span>Loose</span>
                          <span>Strict</span>
                      </div>
                      <input 
                        type="range" min="0" max="0.8" step="0.05" 
                        value={threshold} 
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                      />
                  </div>
              )}
              
              <div className="pt-1">
                  <div className="relative group focus-within:ring-1 focus-within:ring-indigo-500 rounded-lg transition-all">
                    <Search size={12} className="absolute left-2 top-2 text-gray-500 group-focus-within:text-white"/>
                    <input 
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Filter Nodes..."
                        className="w-full bg-black/30 border border-gray-700 rounded-lg py-1.5 pl-7 text-[10px] text-white outline-none placeholder:text-gray-600"
                    />
                  </div>
              </div>
          </div>
      </div>

      {/* --- LIST PANEL --- */}
      <div className="hidden lg:flex flex-col w-64 border-r border-white/5 bg-black/20 backdrop-blur z-20 absolute left-0 top-64 bottom-0 pointer-events-auto">
         <div className="p-3 border-b border-white/10 flex justify-between items-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Dormant Nodes</span>
            <span className="text-[9px] bg-white/10 px-1.5 rounded text-gray-400">{otherNodes.length}</span>
         </div>
         <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
             {otherNodes.map(n => (
                 <div 
                   key={n.id} 
                   onClick={() => handleNodeClick(n.id)} 
                   className="p-2 hover:bg-white/5 rounded cursor-pointer text-xs text-gray-400 hover:text-white truncate transition-all flex items-center gap-2 group"
                 >
                     <div className={`w-1.5 h-1.5 rounded-full ${getModeColor(n.mode).bg} opacity-50 group-hover:opacity-100`}></div>
                     {n.topic}
                 </div>
             ))}
         </div>
      </div>

      {/* --- MAIN LATTICE --- */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(17,24,39,0.5)_0%,_rgba(5,9,17,1)_80%)]">
        
        {/* Render Stage */}
        <div 
            className={`relative w-[600px] h-[600px] flex items-center justify-center transition-all duration-500 ease-in-out ${isTransitioning ? 'scale-50 opacity-0 blur-sm' : 'scale-100 opacity-100 blur-0'}`}
        >
            
            {/* SVG Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
                {connections.map((edge, i) => {
                    const radius = window.innerWidth < 768 ? 140 : 240;
                    const { x, y } = getOrbitPosition(i, satellites.length, radius);
                    const isManual = edge.type === 'manual';
                    
                    return (
                        <g key={`edge-${edge.targetId}`}>
                            <line 
                                x1="50%" y1="50%" 
                                x2={`calc(50% + ${x}px)`} y2={`calc(50% + ${y}px)`} 
                                stroke={isManual ? '#fbbf24' : 'rgba(99, 102, 241, 0.4)'} 
                                strokeWidth={isManual ? 2 : 1}
                                strokeDasharray={isManual ? '0' : '4 4'}
                                opacity={isManual ? 1 : 0.5 + (edge.strength * 0.5)}
                                className="transition-all duration-1000"
                            />
                            {/* Similarity Label on Line */}
                            {autoConnect && !isManual && (
                                <rect 
                                  x={`calc(50% + ${x * 0.5}px - 10px)`} 
                                  y={`calc(50% + ${y * 0.5}px - 6px)`} 
                                  width="20" height="12" 
                                  fill="#050911" 
                                />
                            )}
                            {autoConnect && !isManual && (
                                <text x={`calc(50% + ${x * 0.5}px)`} y={`calc(50% + ${y * 0.5}px + 3px)`} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle" className="font-mono">
                                    {Math.round(edge.strength * 100)}%
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* CENTER NODE (Target Lock UI) */}
            <div className="relative z-30 group cursor-default">
                {/* Target Reticles (Spinning) */}
                <div className={`absolute -inset-10 border border-${centerColors.border.split('-')[1]}-500/20 rounded-full animate-[spin_10s_linear_infinite] pointer-events-none`}></div>
                <div className={`absolute -inset-10 border-t border-b border-${centerColors.border.split('-')[1]}-500/50 rounded-full animate-[spin_10s_linear_infinite] pointer-events-none`}></div>
                <div className={`absolute -inset-6 border-l border-r border-${centerColors.border.split('-')[1]}-500/50 rounded-full animate-[spin_5s_linear_infinite_reverse] pointer-events-none`}></div>
                
                <div className={`w-32 h-32 md:w-44 md:h-44 bg-[#0f172a] border-2 ${centerColors.border} rounded-full flex flex-col items-center justify-center text-center p-4 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10 relative overflow-hidden`}>
                    
                    {/* Background Pulse */}
                    <div className={`absolute inset-0 ${centerColors.bg} opacity-10 animate-pulse`}></div>
                    
                    <div className="relative z-10 flex flex-col items-center gap-1">
                        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-1">
                             <Target size={10} className="animate-ping absolute opacity-75"/> 
                             <Target size={10} /> Active Target
                        </span>
                        <h2 className="text-sm md:text-base font-bold text-white leading-tight mb-2 line-clamp-2">{centerNode.topic}</h2>
                        
                        <div className="flex gap-2 mt-2">
                             <button onClick={(e) => { e.stopPropagation(); onSelectNote(centerNode); }} className={`px-4 py-1.5 bg-white text-black hover:bg-gray-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1 transition-all hover:scale-105 hover:shadow-lg`}>
                                <FileText size={12}/> Open
                             </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* SATELLITES */}
            {satellites.map((node, i) => {
                const radius = window.innerWidth < 768 ? 140 : 240;
                const { x, y } = getOrbitPosition(i, satellites.length, radius);
                const colors = getModeColor(node.mode);
                const isManual = connections[i].type === 'manual';
                const isHovered = hoveredNode?.id === node.id;

                return (
                    <div 
                        key={node.id}
                        className="absolute z-20 group transition-all duration-500"
                        style={{ transform: `translate(${x}px, ${y}px)` }}
                        onMouseEnter={() => setHoveredNode(node)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => handleNodeClick(node.id)} 
                    >
                        {/* Connecting Line Hint (Only on hover) */}
                        {isHovered && (
                             <div className="absolute top-1/2 left-1/2 w-0 h-0 -z-10">
                                 <div className="absolute top-0 left-0 w-[200px] h-[1px] bg-white/20 origin-left rotate-180" style={{ transform: `rotate(${Math.atan2(-y, -x) * (180/Math.PI)}deg)` }}></div>
                             </div>
                        )}

                        {/* Node Circle */}
                        <div className={`
                             w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#0f172a] border-2 flex items-center justify-center cursor-pointer transition-all duration-300 relative
                             ${isHovered ? `scale-125 border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] z-50` : isManual ? 'border-amber-400 shadow-amber-900/20' : 'border-gray-700'}
                        `}>
                            {/* Scanning Effect on Hover */}
                            {isHovered && (
                                <div className="absolute inset-0 rounded-full border border-white/50 animate-ping"></div>
                            )}

                            {isManual && <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 z-10"><Link2 size={8} className="text-black"/></div>}
                            
                            <div className={`${isHovered ? 'text-white' : isManual ? 'text-amber-100' : 'text-gray-400'} transition-colors`}>
                                {getModeIcon(node.mode)}
                            </div>
                        </div>
                        
                        {/* Floating Label (Always visible but subtle) */}
                        <div className={`absolute top-16 left-1/2 -translate-x-1/2 text-center w-32 pointer-events-none transition-all duration-300 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-[-5px]'}`}>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded truncate block border backdrop-blur-md ${isHovered ? 'bg-white text-black border-white' : 'bg-black/60 text-gray-400 border-white/10'}`}>
                                {node.topic}
                            </span>
                        </div>

                        {/* HOVER ACTION MENU */}
                        {isHovered && (
                            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-48 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl p-3 shadow-2xl z-50 pointer-events-auto origin-bottom animate-slide-up">
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${colors.border} ${colors.text} bg-black/50`}>
                                        {node.mode}
                                    </span>
                                    <button 
                                        onClick={(e) => handleToggleLink(e, node)}
                                        className={`p-1.5 rounded transition-colors ${isManual ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                        title={isManual ? "Unlink" : "Link Permanently"}
                                    >
                                        {isManual ? <Unlock size={12}/> : <Link2 size={12}/>}
                                    </button>
                                </div>
                                <div className="flex flex-col gap-1 mt-2">
                                    <button 
                                        onClick={() => handleNodeClick(node.id)}
                                        className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1"
                                    >
                                        <Crosshair size={10}/> Center Focus
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onSelectNote(node); }}
                                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1"
                                    >
                                        <FileText size={10}/> Open Note
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

        </div>

        {/* Status Footer */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-black/80 backdrop-blur px-6 py-2 rounded-full border border-white/10 flex items-center gap-6 shadow-2xl">
                <div className="flex items-center gap-2">
                    <Activity size={12} className="text-green-500 animate-pulse"/>
                    <span className="text-[10px] font-mono text-gray-400">
                        SYSTEM ONLINE <span className="text-gray-600">|</span> NODES: {notes.length}
                    </span>
                </div>
                <div className="h-3 w-[1px] bg-gray-700"></div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span className="text-[9px] text-gray-500 font-bold uppercase">Manual</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 opacity-50"></span>
                    <span className="text-[9px] text-gray-500 font-bold uppercase">Auto</span>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default NeuralLattice;
