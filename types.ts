
export interface LibraryMaterial {
  id: string;
  created_at?: string;
  title: string;
  content: string; // Base64 or Raw Text
  processed_content?: string; // Summary/AI Processed
  file_type: string;
  tags?: string[];
  size?: number; // Optional helper for UI
}

export enum NoteMode {
  GENERAL = 'general',
  CHEAT_CODES = 'cheat_codes',
  COMPREHENSIVE = 'comprehensive',
  CUSTOM = 'custom'
}

export enum AIProvider {
  GEMINI = 'gemini',
  GROQ = 'groq'
}

export enum AppModel {
  // --- GEMINI 3 SERIES ---
  GEMINI_3_PRO = 'gemini-3-pro-preview',
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_3_PRO_IMAGE = 'gemini-3-pro-image-preview', // Nano Banana Pro
  
  // --- GEMINI 2.5 SERIES ---
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE = 'gemini-2.5-flash-lite',
  
  // --- SPECIALIZED ---
  DEEP_RESEARCH_PRO = 'deep-research-pro-preview-12-2025',
  GEMINI_2_0_FLASH = 'gemini-2.0-flash', // Deprecated fallback
  
  // --- GROQ (Defaults, will be fetched dynamically) ---
  GROQ_LLAMA_3_3_70B = 'llama-3.3-70b-versatile',
  GROQ_LLAMA_3_1_8B = 'llama-3.1-8b-instant',
  GROQ_MIXTRAL_8X7B = 'mixtral-8x7b-32768',
  GROQ_GEMMA2_9B = 'gemma2-9b-it'
}

export enum StorageType {
  LOCAL = 'local',
  SUPABASE = 'supabase'
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  data: string;
  isTokenized?: boolean;
}

export interface GenerationConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  apiKey: string;
  groqApiKey?: string;
  mode: NoteMode;
  storageType: StorageType;
  supabaseUrl?: string;
  supabaseKey?: string;
  autoApprove?: boolean;
  customContentPrompt?: string;
  structureModel?: string;
  structureProvider?: AIProvider;
  customStructurePrompt?: string;
}

export interface SyllabusItem {
  id: string;
  topic: string;
  status: 'pending' | 'drafting_struct' | 'struct_ready' | 'generating_note' | 'done' | 'paused_for_review' | 'error';
  structure?: string;
  retryCount?: number;
  errorMsg?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface NoteData {
  topic: string;
  files: UploadedFile[];
  structure: string;
  structureProvider?: AIProvider;
  structureModel?: string;
}

export enum AppView {
  WORKSPACE = 'workspace',
  SYLLABUS = 'syllabus',
  KNOWLEDGE = 'knowledge',
  ARCHIVE = 'archive',
  SETTINGS = 'settings'
}

export interface AppState {
  isLoading: boolean;
  generatedContent: string | null;
  error: string | null;
  progressStep: string;
  currentView: AppView;
  activeNoteId: string | null;
}

export interface StickyNote {
  id: string;
  text: string;
  color: 'yellow' | 'blue' | 'green' | 'pink';
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  topic: string;
  mode: NoteMode;
  content: string;
  provider: AIProvider;
  parentId: string | null;
  folderId?: string;
  tags?: string[];
  _status?: 'local' | 'synced' | 'cloud';
  snippet?: string;
  metadata?: {
    stickies: StickyNote[];
    contextFiles: any[];
  };
}

export interface Folder {
  id: string;
  name: string;
  timestamp: number;
}

export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
}

export interface SavedQueue {
  id: string;
  name: string;
  items: SyllabusItem[];
  timestamp: number;
}

export interface EncryptedPayload {
  geminiKey?: string;
  groqKey?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface NeuroKeyFile {
  version: string;
  meta: {
    issuedTo: string;
    issuedAt: number;
    issuer: string;
  };
  security: {
    iv: string;
    salt: string;
    data: string;
  };
}

export enum AppTheme {
  CLINICAL_CLEAN = 'clinical_clean',
  ACADEMIC_PAPER = 'academic_paper',
  SEPIA_FOCUS = 'sepia_focus'
}

export const GEMINI_MODELS_LIST = [
  { value: AppModel.GEMINI_3_PRO, label: 'Gemini 3.0 Pro' },
  { value: AppModel.GEMINI_3_FLASH, label: 'Gemini 3.0 Flash' },
  { value: AppModel.GEMINI_2_5_FLASH, label: 'Gemini 2.5 Flash' },
];

export const MODE_STRUCTURES: Record<NoteMode, string> = {
  [NoteMode.GENERAL]: "# 1. Definition\n# 2. Pathophysiology\n# 3. Clinical Features\n# 4. Diagnosis\n# 5. Management",
  [NoteMode.CHEAT_CODES]: "# 1. Mnemonics\n# 2. High Yield Facts\n# 3. Exam Buzzwords",
  [NoteMode.COMPREHENSIVE]: "# 1. Introduction\n# 2. Epidemiology\n# 3. Etiology\n# 4. Pathophysiology\n# 5. Clinical Manifestations\n# 6. Diagnostics\n# 7. Treatment\n# 8. Prognosis",
  [NoteMode.CUSTOM]: "# Custom Structure"
};
