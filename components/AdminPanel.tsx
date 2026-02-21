
import React, { useState, useRef } from 'react';
import { 
  ShieldCheck, Sparkles, Cpu, Database, FileSignature, 
  Download, UploadCloud, FileKey, ArrowRight, X, 
  Eye, EyeOff, Key, Wifi, RefreshCw, Lock, Unlock, User, CheckCircle2, AlertTriangle 
} from 'lucide-react';
import { NeuroKeyFile, EncryptedPayload } from '../types';
import { encryptNeuroKey, decryptNeuroKey } from '../utils/crypto';

interface AdminPanelProps {
  onClose: () => void;
  defaultMode?: 'create' | 'edit';
  isAuthenticated?: boolean;
}

const ADMIN_HASH_ENV = (import.meta as any).env?.VITE_ADMIN_HASH || "neuro-admin-8821";
const DEFAULT_PIN = (import.meta as any).env?.VITE_DEFAULT_USER_PIN || "123456";

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, defaultMode = 'create', isAuthenticated = false }) => {
  const [locked, setLocked] = useState(!isAuthenticated);
  const [authInput, setAuthInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<'create' | 'edit'>(defaultMode);
  
  // Form State
  const [genName, setGenName] = useState('');
  const [genPin, setGenPin] = useState(DEFAULT_PIN);
  const [showPin, setShowPin] = useState(false);

  // Toggle State
  const [useGemini, setUseGemini] = useState(false);
  const [useGroq, setUseGroq] = useState(false);
  const [useSupabase, setUseSupabase] = useState(false);

  // Credential State
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');

  // Edit Flow State
  const [editStep, setEditStep] = useState<'upload' | 'decrypt' | 'edit'>('upload');
  const [editFile, setEditFile] = useState<NeuroKeyFile | null>(null);
  const [decryptPin, setDecryptPin] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- AUTH HANDLER ---
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if(authInput === ADMIN_HASH_ENV) {
        setLocked(false);
        setAuthError('');
    } else {
        setAuthError('ACCESS DENIED: INVALID HASH');
        setAuthInput('');
    }
  };

  // --- HELPERS ---

  const handleAutoFill = () => {
    // Attempt to pull from browser storage if available (simulating "Current Config")
    const localGemini = localStorage.getItem('neuro_gemini_key') || ''; 
    if(localGemini) { setGeminiKey(localGemini); setUseGemini(true); }
    
    const localGroq = localStorage.getItem('neuro_groq_key') || ''; 
    if(localGroq) { setGroqKey(localGroq); setUseGroq(true); }

    const localSbUrl = localStorage.getItem('neuro_sb_url');
    const localSbKey = localStorage.getItem('neuro_sb_key');
    
    if(localSbUrl && localSbKey) {
        setSbUrl(localSbUrl);
        setSbKey(localSbKey);
        setUseSupabase(true);
    }
    
    setSuccessMsg("Autofilled from local cache.");
    setTimeout(() => { setError(null); setSuccessMsg(null); }, 3000);
  };

  const resetForm = () => {
      setGenName('');
      setGenPin(DEFAULT_PIN);
      setUseGemini(false); setGeminiKey('');
      setUseGroq(false); setGroqKey('');
      setUseSupabase(false); setSbUrl(''); setSbKey('');
      setEditStep('upload');
      setEditFile(null);
      setDecryptPin('');
      setError(null);
  };

  // --- HANDLERS ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const json = JSON.parse(ev.target?.result as string);
              if(json.security && json.meta) {
                  setEditFile(json);
                  setEditStep('decrypt');
                  setError(null);
              } else {
                  setError("Invalid Keycard File.");
              }
          } catch(err) {
              setError("Corrupt file.");
          }
      };
      reader.readAsText(file);
  };

  const handleDecrypt = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!editFile) return;

      try {
          const payload = await decryptNeuroKey(editFile, decryptPin);
          
          // Populate Form
          setGenName(editFile.meta.issuedTo);
          setGenPin(decryptPin); // Maintain current PIN by default

          if(payload.geminiKey) { setUseGemini(true); setGeminiKey(payload.geminiKey); }
          if(payload.groqKey) { setUseGroq(true); setGroqKey(payload.groqKey); }
          if(payload.supabaseUrl) { 
              setUseSupabase(true); 
              setSbUrl(payload.supabaseUrl); 
              setSbKey(payload.supabaseKey || '');
          }

          setEditStep('edit');
          setError(null);
      } catch (err) {
          setError("Decryption Failed: Wrong PIN");
      }
  };

  const handleMint = async () => {
      if(!genName || !genPin) {
          setError("Identity Name and PIN are required.");
          return;
      }

      // Allow multiline keys -> convert to single line for internal storage if needed, or keep formatting.
      // We will store as-is, services will handle parsing (newlines/commas).
      const payload: EncryptedPayload = {
          geminiKey: useGemini ? geminiKey.trim() : undefined,
          groqKey: useGroq ? groqKey.trim() : undefined,
          supabaseUrl: useSupabase ? sbUrl : undefined,
          supabaseKey: useSupabase ? sbKey : undefined
      };

      try {
          const keyFile = await encryptNeuroKey(payload, genPin, genName);
          
          const blob = new Blob([JSON.stringify(keyFile, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${genName.toLowerCase().replace(/\s+/g, '_')}_access.nkey`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          setSuccessMsg(tab === 'edit' ? "Keycard Updated & Downloaded!" : "New Keycard Minted!");
          if(tab === 'edit') {
              setTimeout(() => {
                  setTab('create');
                  resetForm();
              }, 2000);
          }
      } catch(err) {
          setError("Encryption Error.");
      }
  };

  if (locked) {
    return (
        <div className="flex flex-col h-full bg-[#0f172a] text-white items-center justify-center p-8 relative">
          <button onClick={onClose} className="absolute top-5 right-5 text-gray-500 hover:text-white"><X size={24}/></button>
          
          <div className="w-full max-w-sm space-y-8 animate-fade-in text-center">
             <div className="mx-auto w-24 h-24 bg-red-900/10 rounded-3xl flex items-center justify-center border border-red-900/30 shadow-[0_0_50px_rgba(220,38,38,0.1)]">
                <Lock size={40} className="text-red-500"/>
             </div>
             
             <div>
                <h2 className="text-2xl font-bold tracking-widest uppercase text-white">Restricted Area</h2>
                <p className="text-gray-500 text-xs mt-2 font-mono tracking-wider">ADMINISTRATIVE ACCESS ONLY</p>
             </div>

             <form onSubmit={handleAuth} className="space-y-4">
                <div className="relative">
                    <input 
                    type="password" 
                    value={authInput}
                    onChange={e => setAuthInput(e.target.value)}
                    autoFocus
                    className="w-full bg-black/40 border border-gray-800 rounded-xl p-4 text-center text-white font-mono text-lg outline-none focus:border-red-500/50 transition-colors tracking-widest placeholder:text-gray-700 placeholder:text-sm placeholder:tracking-normal"
                    placeholder="ENTER PASSWORD"
                    />
                </div>
                
                {authError && (
                   <div className="text-red-400 text-[10px] font-bold font-mono tracking-wide animate-pulse bg-red-950/30 p-2 rounded border border-red-900/30">{authError}</div>
                )}

                <button type="submit" className="w-full bg-red-900 hover:bg-red-800 text-white font-bold py-4 rounded-xl text-xs uppercase tracking-[0.2em] border border-red-700/30 transition-all hover:shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                   Unlock Console
                </button>
             </form>
          </div>
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f172a] text-white">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/10 bg-gray-900/50">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2 text-neuro-primary">
                    <ShieldCheck size={24} /> NeuroKey Forge <span className="text-[10px] bg-neuro-primary/20 px-2 py-0.5 rounded-full text-neuro-primary border border-neuro-primary/30">V3.1 ADMIN</span>
                </h2>
                <p className="text-xs text-gray-500 mt-1">Advanced Credential Management System</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div className="flex p-4 gap-4">
            <button 
                onClick={() => { setTab('create'); resetForm(); }}
                className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all
                ${tab === 'create' ? 'bg-neuro-primary/20 border-neuro-primary text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
            >
                <Sparkles size={16}/> Mint New Key
            </button>
            <button 
                onClick={() => { setTab('edit'); resetForm(); }}
                className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all
                ${tab === 'edit' ? 'bg-neuro-accent/20 border-neuro-accent text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
            >
                <FileSignature size={16}/> Edit Existing
            </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6">
            
            {/* === EDIT MODE: UPLOAD & DECRYPT === */}
            {tab === 'edit' && editStep === 'upload' && (
                <div className="h-full flex flex-col items-center justify-center space-y-6 animate-fade-in py-10">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-sm border-2 border-dashed border-gray-700 hover:border-neuro-accent bg-gray-900/40 hover:bg-gray-800 p-10 rounded-3xl flex flex-col items-center cursor-pointer transition-all group"
                    >
                        <div className="bg-gray-800 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                            <UploadCloud size={32} className="text-neuro-accent"/>
                        </div>
                        <h3 className="font-bold text-gray-300 group-hover:text-white">Upload .nkey File</h3>
                        <p className="text-xs text-gray-500 mt-2 text-center">Select the keycard you wish to modify</p>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".nkey,.json"/>
                    </div>
                </div>
            )}

            {tab === 'edit' && editStep === 'decrypt' && editFile && (
                <div className="max-w-md mx-auto mt-10 space-y-6 animate-slide-up">
                    <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-xl flex items-center gap-4">
                        <div className="p-3 bg-neuro-accent/20 rounded-lg text-neuro-accent"><FileKey size={24}/></div>
                        <div>
                            <p className="text-sm font-bold text-white">{editFile.meta.issuedTo}</p>
                            <p className="text-xs text-gray-500">Issued: {new Date(editFile.meta.issuedAt).toLocaleDateString()}</p>
                        </div>
                    </div>
                    
                    <form onSubmit={handleDecrypt} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Enter Original PIN</label>
                            <input 
                                type="password" 
                                value={decryptPin} 
                                onChange={e => setDecryptPin(e.target.value)}
                                className="w-full bg-black/40 border border-gray-600 rounded-xl p-4 text-center text-xl tracking-[0.5em] font-mono focus:border-neuro-accent outline-none text-white transition-all"
                                autoFocus
                                placeholder="••••••"
                            />
                        </div>
                        <button type="submit" className="w-full bg-neuro-accent hover:bg-sky-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <Unlock size={18}/> Decrypt & Edit
                        </button>
                        <button type="button" onClick={resetForm} className="w-full text-xs text-gray-500 hover:text-white py-2">Cancel</button>
                    </form>
                </div>
            )}

            {/* === MAIN FORM (CREATE or EDIT STEP 3) === */}
            {(tab === 'create' || (tab === 'edit' && editStep === 'edit')) && (
                <div className="space-y-6 animate-slide-up">
                    
                    {/* Identity Section */}
                    <div className="bg-gray-900/40 border border-gray-800 p-5 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2 text-neuro-primary font-bold text-xs uppercase tracking-wider mb-2">
                            <User size={14}/> Identity Configuration
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">Issued To</label>
                                <input type="text" value={genName} onChange={e => setGenName(e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-neuro-primary outline-none" placeholder="e.g. Dr. Strange" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1 flex justify-between">
                                    <span>Access PIN</span>
                                    <button onClick={() => setShowPin(!showPin)} className="text-neuro-primary hover:text-white">{showPin ? <EyeOff size={10}/> : <Eye size={10}/>}</button>
                                </label>
                                <input type={showPin ? "text" : "password"} value={genPin} onChange={e => setGenPin(e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-sm font-mono text-white focus:border-neuro-primary outline-none" placeholder="123456" />
                            </div>
                        </div>
                    </div>

                    {/* API Credentials Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <div className="flex items-center gap-2 text-neuro-primary font-bold text-xs uppercase tracking-wider">
                                <Cpu size={14}/> API Payloads (Load Balancing Enabled)
                            </div>
                            <button onClick={handleAutoFill} className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-neuro-primary transition-colors">
                                <RefreshCw size={10}/> Auto-Fill Local
                            </button>
                        </div>

                        {/* Gemini */}
                        <div className={`border rounded-xl p-4 transition-all duration-300 ${useGemini ? 'bg-indigo-900/10 border-indigo-500/50' : 'bg-gray-900/20 border-gray-800 opacity-80'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${useGemini ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500'}`}><Sparkles size={16}/></div>
                                    <span className="font-bold text-sm">Google Gemini Key Pool</span>
                                </div>
                                <input type="checkbox" checked={useGemini} onChange={e => setUseGemini(e.target.checked)} className="accent-indigo-500 w-4 h-4"/>
                            </div>
                            {useGemini && (
                                <textarea 
                                    value={geminiKey} 
                                    onChange={e => setGeminiKey(e.target.value)} 
                                    className="w-full h-24 bg-black/40 border border-indigo-500/30 rounded-lg p-2.5 text-xs text-indigo-100 font-mono outline-none focus:border-indigo-500 animate-fade-in resize-none" 
                                    placeholder="Enter multiple API Keys (one per line OR comma-separated) to enable rotation and failover." 
                                />
                            )}
                        </div>

                        {/* Groq */}
                        <div className={`border rounded-xl p-4 transition-all duration-300 ${useGroq ? 'bg-orange-900/10 border-orange-500/50' : 'bg-gray-900/20 border-gray-800 opacity-80'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${useGroq ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}><Cpu size={16}/></div>
                                    <span className="font-bold text-sm">Groq Cloud Key Pool</span>
                                </div>
                                <input type="checkbox" checked={useGroq} onChange={e => setUseGroq(e.target.checked)} className="accent-orange-500 w-4 h-4"/>
                            </div>
                            {useGroq && (
                                <textarea 
                                    value={groqKey} 
                                    onChange={e => setGroqKey(e.target.value)} 
                                    className="w-full h-24 bg-black/40 border border-orange-500/30 rounded-lg p-2.5 text-xs text-orange-100 font-mono outline-none focus:border-orange-500 animate-fade-in resize-none" 
                                    placeholder="Enter multiple API Keys (one per line OR comma-separated) to enable rotation and failover." 
                                />
                            )}
                        </div>

                        {/* Supabase (Separated URL & Key) */}
                        <div className={`border rounded-xl p-4 transition-all duration-300 ${useSupabase ? 'bg-emerald-900/10 border-emerald-500/50' : 'bg-gray-900/20 border-gray-800 opacity-80'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${useSupabase ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500'}`}><Database size={16}/></div>
                                    <div>
                                        <span className="font-bold text-sm block">Supabase</span>
                                        <span className="text-[9px] text-gray-500">Cloud Storage & Realtime</span>
                                    </div>
                                </div>
                                <input type="checkbox" checked={useSupabase} onChange={e => setUseSupabase(e.target.checked)} className="accent-emerald-500 w-4 h-4"/>
                            </div>
                            {useSupabase && (
                                <div className="space-y-3 animate-fade-in">
                                    <div className="relative">
                                        <Wifi size={14} className="absolute left-3 top-2.5 text-emerald-500"/>
                                        <input type="text" value={sbUrl} onChange={e => setSbUrl(e.target.value)} className="w-full bg-black/40 border border-emerald-500/30 rounded-lg p-2.5 pl-9 text-xs text-emerald-100 outline-none focus:border-emerald-500" placeholder="https://your-project.supabase.co" />
                                    </div>
                                    <div className="relative">
                                        <Key size={14} className="absolute left-3 top-2.5 text-emerald-500"/>
                                        <input type="password" value={sbKey} onChange={e => setSbKey(e.target.value)} className="w-full bg-black/40 border border-emerald-500/30 rounded-lg p-2.5 pl-9 text-xs text-emerald-100 font-mono outline-none focus:border-emerald-500" placeholder="public-anon-key" />
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-white/10 bg-gray-900/80 backdrop-blur">
            {error && (
                <div className="mb-4 bg-red-900/20 border border-red-900/50 rounded-lg p-3 flex items-center gap-2 animate-fade-in">
                    <AlertTriangle size={16} className="text-red-400"/>
                    <span className="text-xs text-red-200">{error}</span>
                </div>
            )}
            {successMsg && (
                <div className="mb-4 bg-green-900/20 border border-green-900/50 rounded-lg p-3 flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={16} className="text-green-400"/>
                    <span className="text-xs text-green-200">{successMsg}</span>
                </div>
            )}

            {(tab === 'create' || (tab === 'edit' && editStep === 'edit')) && (
                <button 
                    onClick={handleMint}
                    className="w-full py-4 bg-gradient-to-r from-neuro-primary to-indigo-600 hover:from-indigo-500 hover:to-neuro-primary rounded-xl font-bold text-white shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                >
                    <Download size={18}/> 
                    {tab === 'edit' ? 'Update & Re-Mint Keycard' : 'Mint Secure Keycard'}
                </button>
            )}
        </div>
    </div>
  );
};

export default AdminPanel;
