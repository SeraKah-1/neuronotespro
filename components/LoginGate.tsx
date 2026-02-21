
import React, { useState, useRef } from 'react';
import { BrainCircuit, Lock, Unlock, UploadCloud, AlertTriangle, ShieldCheck, FileKey, X } from 'lucide-react';
import { NeuroKeyFile, EncryptedPayload } from '../types';
import { decryptNeuroKey } from '../utils/crypto';
import AdminPanel from './AdminPanel';

interface LoginGateProps {
  onUnlock: (config: EncryptedPayload) => void;
}

const ADMIN_HASH_ENV = (import.meta as any).env?.VITE_ADMIN_HASH || "neuro-admin-8821";

const LoginGate: React.FC<LoginGateProps> = ({ onUnlock }) => {
  const [mode, setMode] = useState<'locked' | 'pin' | 'admin_auth' | 'admin_panel'>('locked');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [pendingFile, setPendingFile] = useState<NeuroKeyFile | null>(null);
  const [pin, setPin] = useState('');
  const [adminAuthInput, setAdminAuthInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.version && json.security && json.security.data) {
          setPendingFile(json);
          setMode('pin');
          setError(null);
        } else setError("Invalid NeuroKey file format.");
      } catch (err) { setError("Corrupted or invalid file."); }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFile || !pin) return;
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 500));
      const payload = await decryptNeuroKey(pendingFile, pin);
      onUnlock(payload);
    } catch (err: any) {
      setError("Decryption Failed: Invalid PIN.");
      setLoading(false);
    }
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminAuthInput === ADMIN_HASH_ENV) {
      setMode('admin_panel');
      setError(null);
      setAdminAuthInput('');
    } else setError("Access Denied: Invalid Hash.");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#050911] flex items-center justify-center p-4" onDragEnter={handleDrag}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-neuro-primary/5 rounded-full blur-[150px]"></div>
        <div className="grid grid-cols-[repeat(20,1fr)] h-full opacity-5">
           {[...Array(20)].map((_, i) => <div key={i} className="border-r border-neuro-primary/30"></div>)}
        </div>
      </div>

      {dragActive && mode === 'locked' && (
        <div className="absolute inset-0 bg-neuro-primary/20 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-neuro-primary border-dashed m-4 rounded-3xl" 
             onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
           <div className="text-center animate-pulse">
             <UploadCloud size={80} className="text-white mx-auto mb-4" />
             <h2 className="text-3xl font-bold text-white tracking-widest uppercase">Initiate Uplink</h2>
           </div>
        </div>
      )}

      {mode === 'admin_panel' ? (
          <div className="relative z-20 w-full max-w-2xl bg-[#0f172a] border border-gray-800 rounded-3xl shadow-2xl overflow-hidden h-[80vh]">
              <AdminPanel onClose={() => setMode('locked')} isAuthenticated={true} />
          </div>
      ) : (
          <div className="relative z-10 w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-neuro-primary/10 rounded-2xl flex items-center justify-center border border-neuro-primary/30 shadow-[0_0_30px_rgba(99,102,241,0.2)] mb-4 select-none">
                <BrainCircuit className="text-neuro-primary" size={40} />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-widest uppercase">NeuroNote <span className="text-neuro-primary">Secure</span></h1>
              <p className="text-neuro-textMuted text-xs font-mono mt-2 tracking-[0.2em]">IDENTITY VERIFICATION PROTOCOL</p>
            </div>

            {mode === 'locked' && (
              <div className="bg-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center space-y-6 animate-fade-in relative">
                <div className="border-2 border-dashed border-gray-700 rounded-xl p-10 hover:border-neuro-primary/50 transition-colors group cursor-pointer" onClick={() => inputRef.current?.click()}>
                  <FileKey size={48} className="text-gray-500 mx-auto mb-4 group-hover:text-neuro-primary transition-colors" />
                  <h3 className="text-gray-300 font-bold uppercase text-sm mb-1">Drop Access Key</h3>
                  <input type="file" accept=".nkey,.json" ref={inputRef} className="hidden" onChange={(e) => e.target.files && processFile(e.target.files[0])} />
                </div>
                {error && <div className="text-xs text-red-400 bg-red-900/10 p-2 rounded">{error}</div>}
                <div className="pt-4 border-t border-white/5 flex justify-center">
                  <button onClick={() => setMode('admin_auth')} className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-2 transition-colors uppercase font-bold tracking-wider py-2 px-4 rounded hover:bg-white/5">
                    <ShieldCheck size={14}/> Admin Access
                  </button>
                </div>
              </div>
            )}

            {mode === 'pin' && (
              <form onSubmit={handleUnlock} className="bg-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6 animate-slide-up">
                  <div className="flex justify-between items-center">
                     <span className="text-sm font-bold text-white">Enter PIN</span>
                     <button type="button" onClick={() => { setMode('locked'); setPendingFile(null); }}><X size={16} className="text-gray-500 hover:text-white"/></button>
                  </div>
                  <input type="password" value={pin} onChange={e => setPin(e.target.value)} autoFocus className="w-full bg-black/50 border border-gray-700 text-center text-white text-2xl font-mono tracking-[0.5em] rounded-xl py-4 focus:border-neuro-primary outline-none" placeholder="••••••" />
                  {error && <div className="text-xs text-red-400 text-center">{error}</div>}
                  <button type="submit" disabled={loading} className="w-full bg-neuro-primary hover:bg-neuro-primaryHover text-white font-bold py-3.5 rounded-xl uppercase flex items-center justify-center gap-2">
                    {loading ? <span className="animate-spin">⟳</span> : <Unlock size={16} />} <span>{loading ? 'Decrypting...' : 'Unlock'}</span>
                  </button>
              </form>
            )}

            {mode === 'admin_auth' && (
              <form onSubmit={handleAdminAuth} className="bg-red-950/20 backdrop-blur-xl border border-red-900/30 rounded-2xl p-8 shadow-2xl space-y-6 animate-fade-in">
                <div className="flex items-center gap-2 text-red-500 mb-2"><AlertTriangle size={18} /><span className="text-xs font-bold uppercase tracking-widest">Restricted Admin Panel</span></div>
                <input type="password" value={adminAuthInput} onChange={e => setAdminAuthInput(e.target.value)} autoFocus placeholder="Enter Admin Hash..." className="w-full bg-black/50 border border-red-900/50 rounded-lg p-3 text-red-100 focus:border-red-500 outline-none font-mono" />
                {error && <div className="text-xs text-red-400">{error}</div>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('locked')} className="flex-1 bg-transparent hover:bg-white/5 text-gray-400 py-2 rounded-lg text-xs">Cancel</button>
                  <button type="submit" className="flex-1 bg-red-900 hover:bg-red-800 text-white py-2 rounded-lg text-xs font-bold uppercase border border-red-700">Authenticate</button>
                </div>
              </form>
            )}
          </div>
      )}
    </div>
  );
};

export default LoginGate;
