
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCcw, 
  Maximize, Minimize2, Image as ImageIcon,
  Edit2, Play, X, AlertCircle, Loader2
} from 'lucide-react';

interface MermaidProps {
  chart: string;
  onChartChange?: (newCode: string) => void;
}

const cleanMermaidSyntax = (raw: string): string => {
  let clean = raw
    .replace(/```mermaid/g, '')
    .replace(/```/g, '')
    .trim();
  return clean;
};

const Mermaid: React.FC<MermaidProps> = ({ chart, onChartChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // STATE
  const [internalChart, setInternalChart] = useState(chart);
  const [draftCode, setDraftCode] = useState(chart);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [svgContent, setSvgContent] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  const [transform, setTransform] = useState({ scale: 1 });
  const uniqueId = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    if (!isEditing) {
        const cleaned = cleanMermaidSyntax(chart);
        setInternalChart(cleaned);
        setDraftCode(cleaned); 
    }
  }, [chart, isEditing]); 

  // --- RENDER ENGINE (FIXED FOR TEXT WRAPPING & UI FREEZE) ---
  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      if (!internalChart) return;
      
      // 1. Set Loading State
      setStatus('loading');
      setErrorMsg('');

      // 2. CRITICAL FIX: Yield to main thread so React can render the spinner
      await new Promise(resolve => setTimeout(resolve, 50));
      
      try {
        const mermaid = (await import('mermaid')).default;
        
        // Configuration to fix text truncation
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'arial, sans-serif',
          flowchart: { 
            htmlLabels: true, // CRITICAL: Enables HTML in nodes for CSS styling
            useMaxWidth: true,
            padding: 15
          },
          themeVariables: {
              fontSize: '16px',
              fontFamily: 'arial, sans-serif'
          }
        });

        try {
            const { svg } = await mermaid.render(uniqueId, internalChart);
            if (isMounted) {
              setSvgContent(svg);
              setStatus('success');
            }
        } catch (renderError: any) {
            console.warn("Mermaid inner render error", renderError);
            throw new Error("Syntax Error: " + (renderError.message || "Invalid Diagram"));
        }

      } catch (err: any) {
        if (isMounted) {
          setStatus('error');
          setErrorMsg(err.message || 'Syntax Error');
        }
      }
    };
    
    renderChart();
    return () => { isMounted = false; };
  }, [internalChart, uniqueId]);

  // --- HANDLERS ---
  const handleZoom = (delta: number) => {
      setTransform(prev => ({ ...prev, scale: Math.min(Math.max(0.5, prev.scale + delta), 3) }));
  };

  const downloadImage = () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;
    
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([source], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
        const canvas = document.createElement("canvas");
        const bbox = svgElement.getBBox();
        const scale = 2; // High res export
        canvas.width = (bbox.width + 40) * scale;
        canvas.height = (bbox.height + 40) * scale;
        const ctx = canvas.getContext("2d");
        if(ctx) {
            ctx.fillStyle = "#ffffff"; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(scale, scale);
            ctx.drawImage(img, 20, 20); // Add padding
            const pngUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = `diagram_${Date.now()}.png`;
            a.click();
        }
    };
    img.src = url;
  };

  if (status === 'error' && !isEditing) {
    return (
      <div className="my-6 p-4 rounded-lg border border-red-200 bg-red-50 flex flex-col items-center justify-center text-center">
         <AlertCircle className="text-red-500 mb-2" size={20}/>
         <h3 className="text-xs font-bold text-red-900 uppercase">Diagram Error</h3>
         <p className="text-[10px] text-red-600 mt-1 mb-3 max-w-md font-mono line-clamp-2">{errorMsg}</p>
         <button onClick={() => setIsEditing(true)} className="px-3 py-1 bg-white border border-red-200 text-red-700 rounded text-xs font-bold hover:bg-red-50 transition-colors shadow-sm">
           Fix Code
         </button>
      </div>
    );
  }

  return (
    <div className={`
        relative my-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col group
        ${isFullscreen ? 'fixed inset-0 z-[100] h-[100dvh] m-0 rounded-none' : isEditing ? 'h-[500px]' : 'min-h-[200px]'}
    `}>
      {/* 
          CRITICAL FIX: CSS Injection for Node Text Wrapping 
          We target the specific ID to avoid global side effects.
          This forces the div inside foreignObject to wrap text properly.
      */}
      <style>{`
        #${uniqueId} .node foreignObject { overflow: visible; }
        #${uniqueId} .node foreignObject div {
            white-space: normal !important;
            word-wrap: break-word !important;
            max-width: 200px !important;
            text-align: center !important;
            line-height: 1.4 !important;
        }
        #${uniqueId} .label {
            font-family: 'Inter', sans-serif !important;
        }
      `}</style>
      
      {/* HEADER / TOOLBAR */}
      <div className="h-9 border-b border-gray-200 flex items-center justify-between px-2 bg-gray-50 shrink-0">
         <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">Mermaid</span>
            {status === 'loading' && <span className="text-[9px] text-blue-500 font-bold animate-pulse">Rendering...</span>}
         </div>
         
         <div className="flex items-center gap-1">
            {!isEditing ? (
              <>
                <button onClick={() => handleZoom(-0.1)} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Zoom Out"><ZoomOut size={13}/></button>
                <button onClick={() => handleZoom(0.1)} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Zoom In"><ZoomIn size={13}/></button>
                <button onClick={() => setTransform({scale:1})} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Reset"><RotateCcw size={13}/></button>
                
                <div className="w-[1px] h-3 bg-gray-300 mx-1"></div>
                
                <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-blue-600" title="Edit Source"><Edit2 size={13}/></button>
                <button onClick={downloadImage} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Download PNG"><ImageIcon size={13}/></button>
                
                <div className="w-[1px] h-3 bg-gray-300 mx-1"></div>
                
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 hover:bg-gray-200 rounded text-gray-600" title="Fullscreen">
                   {isFullscreen ? <Minimize2 size={13}/> : <Maximize size={13}/>}
                </button>
              </>
            ) : (
                <button onClick={() => setIsEditing(false)} className="p-1.5 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded transition-colors"><X size={13}/></button>
            )}
         </div>
      </div>

      {/* CONTENT AREA */}
      {isEditing ? (
          <div className="flex-1 flex flex-col relative bg-[#1e1e1e]">
              <textarea 
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  className="flex-1 w-full h-full p-4 font-mono text-[11px] leading-relaxed bg-transparent text-gray-300 outline-none resize-none custom-scrollbar"
                  spellCheck={false}
              />
              <div className="h-9 border-t border-gray-700 bg-[#1e1e1e] flex justify-end items-center px-2">
                  <button 
                    onClick={() => { 
                      setInternalChart(draftCode); 
                      setIsEditing(false); 
                      if (onChartChange) onChartChange(draftCode);
                    }} 
                    className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                      <Play size={10} fill="currentColor"/> Render
                  </button>
              </div>
          </div>
      ) : (
          <div 
            className="flex-1 overflow-auto bg-white p-4 flex items-center justify-center min-h-0 relative"
            ref={containerRef}
          >
            {/* LOADING OVERLAY */}
            {status === 'loading' && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-blue-500 mb-2" size={24}/>
                  <span className="text-xs text-gray-500 font-mono animate-pulse">Rendering Diagram...</span>
               </div>
            )}

            <div 
               style={{ 
                   transform: `scale(${transform.scale})`, 
                   transformOrigin: 'center top',
                   transition: 'transform 0.2s ease-out',
                   width: '100%',
                   display: 'flex',
                   justifyContent: 'center',
                   opacity: status === 'loading' ? 0.3 : 1
               }}
               dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
      )}
    </div>
  );
};

export default React.memo(Mermaid);
