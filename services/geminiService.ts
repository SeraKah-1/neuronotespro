
import { GoogleGenAI } from "@google/genai";
import { GenerationConfig, UploadedFile, SyllabusItem, ChatMessage, NoteMode } from '../types';
import { getStrictPrompt, UNIVERSAL_STRUCTURE_PROMPT } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

// --- MODEL FAILOVER CONFIGURATION ---
const MODEL_PRIORITY = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash' // Fallback
];

// Helper to get authenticated AI instance
const getAIClient = (config: GenerationConfig) => {
  // SAFE ENV ACCESS
  const envKey = (import.meta as any).env?.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '');
  let apiKey = config.apiKey || envKey;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please unlock with your NeuroKey Card or check Settings.");
  }

  // KEY ROTATION LOGIC
  if (apiKey.includes(',') || apiKey.includes('\n')) {
      const keys = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
      if (keys.length > 0) {
          const randomIndex = Math.floor(Math.random() * keys.length);
          apiKey = keys[randomIndex];
      }
  }

  return new GoogleGenAI({ apiKey });
};

// --- ROBUST FAILOVER WRAPPER ---
const executeWithFailover = async <T>(
  config: GenerationConfig,
  operationName: string,
  onProgress: ((status: string) => void) | undefined,
  operation: (model: string, ai: GoogleGenAI) => Promise<T>
): Promise<T> => {
  const ai = getAIClient(config);
  
  // If user explicitly selected a Pro model, try that first, then fallback to Flash sequence
  // If user selected a Flash model, start with the priority list
  let candidateModels = [...MODEL_PRIORITY];
  
  if (config.model.includes('pro')) {
      candidateModels = [config.model, ...MODEL_PRIORITY];
  } else {
      // Ensure the user's selected model is tried first if it's not in the list
      if (!candidateModels.includes(config.model)) {
          candidateModels = [config.model, ...candidateModels];
      } else {
          // Reorder to put selected model first
          candidateModels = candidateModels.filter(m => m !== config.model);
          candidateModels.unshift(config.model);
      }
  }

  // Remove duplicates
  candidateModels = [...new Set(candidateModels)];

  let lastError: any = null;

  for (const model of candidateModels) {
      try {
          if (onProgress) onProgress(`Attempting with ${model}...`);
          return await operation(model, ai);
      } catch (error: any) {
          console.warn(`Model ${model} failed:`, error.message);
          lastError = error;

          // Only failover on Quota/Rate Limits or Server Errors
          const isQuota = error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("resource_exhausted");
          const isServer = error.message?.includes("503") || error.message?.includes("500");
          
          if (!isQuota && !isServer) {
              // If it's a prompt error or invalid argument, fail immediately (don't retry)
              throw error;
          }
          
          // If Quota error, continue to next model
          if (onProgress) onProgress(`Quota limit on ${model}. Switching engine...`);
          await new Promise(r => setTimeout(r, 1000)); // Brief cool-down
      }
  }

  throw new Error(`All models failed. Last error: ${lastError?.message || "Unknown error"}`);
};

export const generateNoteContent = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  files: UploadedFile[],
  onProgress: (status: string) => void
): Promise<string> => {
  
  onProgress("Checking configurations...");

  return executeWithFailover(config, "Generate Note", onProgress, async (model, ai) => {
      
      // --- 1. COMPREHENSIVE MODE: MEGA-PROMPT STRATEGY (OPTIMIZED FOR FREE TIER) ---
      if (config.mode === NoteMode.COMPREHENSIVE) {
         onProgress(`COMPREHENSIVE MODE (${model}): Generating Full Chapter (Mega-Prompt)...`);
         
         // Construct the Mega Prompt
         const megaPrompt = `
         CONTEXT: We are writing a Medical Textbook Chapter on "${topic}".
         
         FULL CHAPTER OUTLINE TO GENERATE:
         ${structure}
         
         ***CRITICAL WRITING INSTRUCTIONS (STRICT)***:
         1. **ONE CONTINUOUS OUTPUT:** Write the ENTIRE chapter based on the outline above in a single response.
         2. **LENGTH & DEPTH:** Do NOT summarize. This must be a "Deep Dive". Aim for maximum detail allowed by your output limit.
         3. **STRUCTURE PER SECTION:**
            - Start with a functional definition.
            - Explain PATHOPHYSIOLOGY in detail.
            - Provide CLINICAL CORRELATIONS.
            - Include PHARMACOLOGY if relevant.
         4. **FORMATTING:**
            - Use Markdown Headers (#, ##, ###) exactly as requested in the outline.
            - Use Bold for key terms.
            - Use Tables for comparisons.
            - Use ">>>" for clinical pearls.
         5. **NO HALLUCINATIONS:** If you don't know a specific detail, state general principles.
         
         ${config.customContentPrompt ? `USER SPECIAL INSTRUCTION: ${config.customContentPrompt}` : ''}
         
         OUTPUT THE FULL CHAPTER CONTENT NOW.
         `;

         const parts: any[] = [{ text: megaPrompt }];
         if (files && files.length > 0) {
             files.forEach(f => {
                 if (f.mimeType === 'text/plain') {
                     // Decode Base64 text and append as context
                     try {
                         const decodedText = decodeURIComponent(escape(atob(f.data)));
                         parts.push({ text: `\n\nREFERENCE MATERIAL (${f.name}):\n${decodedText}\n\n` });
                     } catch (e) {
                         console.warn(`Failed to decode text file ${f.name}`, e);
                     }
                 } else {
                     // Standard binary handling (Images, etc.)
                     parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
                 }
             });
         }

         // Use maximum output tokens allowed
         const response = await ai.models.generateContent({
             model: model, 
             contents: { parts },
             config: { temperature: 0.2, maxOutputTokens: 8192 } 
         });
         
         const fullContent = response.text || "> [!danger] GENERATION FAILED.";
         
         onProgress("Finalizing & Formatting Textbook...");
         return processGeneratedNote(fullContent);
      }

      // --- 2. STANDARD MODES ---
      const textPrompt = getStrictPrompt(topic, structure, config.mode, config.customContentPrompt);
      const parts: any[] = [{ text: textPrompt }];

      if (files && files.length > 0) {
        files.forEach(file => {
          if (file.mimeType === 'text/plain') {
              try {
                  const decodedText = decodeURIComponent(escape(atob(file.data)));
                  parts.push({ text: `\n\nREFERENCE MATERIAL (${file.name}):\n${decodedText}\n\n` });
              } catch (e) {
                  console.warn(`Failed to decode text file ${file.name}`, e);
              }
          } else {
              parts.push({
                inlineData: {
                  mimeType: file.mimeType,
                  data: file.data
                }
              });
          }
        });
      }

      onProgress(`Synthesizing content (${model})...`);
      
      const response = await ai.models.generateContent({
        model: model,
        contents: { parts },
        config: {
          temperature: config.temperature,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 65536, 
        }
      });

      const rawText = response.text;
      if (!rawText) throw new Error("Received empty response from AI.");

      onProgress("Formatting & Cleaning Mermaid syntax...");
      return processGeneratedNote(rawText);
  });
};

/* -------------------------------------------------------------------------- */
/*                    AUTO-STRUCTURE GENERATOR                                */
/* -------------------------------------------------------------------------- */

export const generateDetailedStructure = async (
  config: GenerationConfig,
  topic: string
): Promise<string> => {
  const ai = getAIClient(config);
  // Use config.structureModel if available, else standard config.model
  const modelName = config.structureModel || (config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview');

  try {
    const systemPrompt = config.customStructurePrompt || UNIVERSAL_STRUCTURE_PROMPT;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: `${systemPrompt}\n\nINPUT TOPIC: ${topic}\n\nNOTE: If Comprehensive Mode is intended, provide at least 5-8 detailed H1 headers (#) with 3-5 sub-bullets each.` }]
      },
      config: { temperature: 0.3 }
    });

    return response.text || "";
  } catch (e: any) {
    console.error("Structure Auto-Gen Error", e);
    throw new Error("Failed to auto-generate structure: " + e.message);
  }
};

/* -------------------------------------------------------------------------- */
/*                             SYLLABUS PARSERS                               */
/* -------------------------------------------------------------------------- */

const SYLLABUS_PROMPT = `
  TASK: Analyze the provided Syllabus content (Text/JSON/PDF).
  GOAL: Extract a logical, sequential learning path of specific medical topics.
  RETURN JSON STRING ARRAY ONLY.
`;

export const parseSyllabusToTopics = async (
  config: GenerationConfig,
  file: UploadedFile
): Promise<SyllabusItem[]> => {
  const ai = getAIClient(config);
  // Use config.model if it seems valid for Gemini
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  try {
    const parts: any[] = [{ text: SYLLABUS_PROMPT }];
    
    if (file.mimeType === 'text/plain') {
        try {
            const decodedText = decodeURIComponent(escape(atob(file.data)));
            parts.push({ text: `\n\nSYLLABUS CONTENT:\n${decodedText}` });
        } catch (e) {
            console.warn("Failed to decode syllabus text", e);
            // Fallback to inlineData if decode fails (unlikely)
            parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        }
    } else {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    
    // ROBUST PARSING: Extract JSON Array first
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let topics: string[] = [];
    try {
        topics = JSON.parse(cleanJson);
    } catch (e) {
        // Fallback: Try splitting by newlines if it looks like a list
        console.warn("JSON Parse Failed, attempting fallback split", e);
        topics = text.split('\n')
            .map(t => t.replace(/^\d+[\.\)]\s*/, '').replace(/^- /, '').trim())
            .filter(t => t.length > 0 && !t.startsWith('[') && !t.startsWith('TASK') && !t.startsWith('GOAL'));
    }

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Parsing Error", e);
    throw new Error("Failed to parse syllabus file.");
  }
};

export const parseSyllabusFromText = async (
  config: GenerationConfig,
  rawText: string
): Promise<SyllabusItem[]> => {
  const ai = getAIClient(config);
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: `${SYLLABUS_PROMPT}\n\nINPUT TEXT:\n${rawText}` }]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    
    // ROBUST PARSING: Extract JSON Array first
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let topics: string[] = [];
    try {
        topics = JSON.parse(cleanJson);
    } catch (e) {
        // Fallback: Try splitting by newlines if it looks like a list
        console.warn("JSON Parse Failed, attempting fallback split", e);
        topics = text.split('\n')
            .map(t => t.replace(/^\d+[\.\)]\s*/, '').replace(/^- /, '').trim())
            .filter(t => t.length > 0 && !t.startsWith('[') && !t.startsWith('TASK') && !t.startsWith('GOAL'));
    }

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Text Parsing Error", e);
    throw new Error("Failed to parse syllabus text.");
  }
};

/* -------------------------------------------------------------------------- */
/*                       MAGIC REFINE (EDIT) ENGINE                           */
/* -------------------------------------------------------------------------- */

export const refineNoteContent = async (
  config: GenerationConfig,
  currentContent: string,
  instruction: string
): Promise<string> => {
  const ai = getAIClient(config);
  // Use currently selected model
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  const prompt = `
  ROLE: Expert Medical Editor.
  TASK: Modify the following Medical Note based on the USER INSTRUCTION.

  USER INSTRUCTION: "${instruction}"

  RULES:
  1. Retain the original Markdown formatting (Headers, Mermaid charts, Callouts) unless specifically asked to change them.
  2. Do NOT output "Here is the revised note". Just output the Markdown.
  3. Ensure technical accuracy is maintained.

  ORIGINAL CONTENT:
  """
  ${currentContent}
  """
  `;

  try {
      const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: [{ text: prompt }] },
          config: { temperature: 0.3 }
      });

      const text = response.text || currentContent;
      return processGeneratedNote(text);
  } catch (e: any) {
      console.error("Gemini Refinement Error", e);
      throw new Error("Failed to refine content: " + e.message);
  }
};

/* -------------------------------------------------------------------------- */
/*                       NEURO-SIDEKICK CHAT ENGINE                           */
/* -------------------------------------------------------------------------- */

export const generateChatResponse = async (
  config: GenerationConfig,
  history: ChatMessage[],
  currentNoteContent: string,
  userMessage: string
): Promise<string> => {
  const ai = getAIClient(config);
  // Chat works best with Pro models usually, but Flash is faster for interaction
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  const systemContext = `
  SYSTEM: You are "Neuro-Sidekick", an intelligent medical tutor assistant.
  CONTEXT: The user is studying a note. You have access to the content below.
  GOAL: Help the user understand deeply.
  
  MODES:
  1. If user asks "Explain", simplify the concept using an analogy.
  2. If user asks "Quiz me", generate a single multiple-choice question about the note.
  3. If user asks "Summarize", provide a TL;DR.
  
  NOTE CONTENT:
  """
  ${currentNoteContent.substring(0, 10000)} ... (truncated if too long)
  """
  `;

  try {
      // We assume simple single-turn or limited history for now to save tokens context
      // Construct chat history for the API
      const historyContents = history.map(h => ({
          role: h.role,
          parts: [{ text: h.content }]
      }));

      const chat = ai.chats.create({
          model: modelName,
          config: {
              systemInstruction: systemContext,
              temperature: 0.5,
          },
          history: historyContents
      });

      const result = await chat.sendMessage({ message: userMessage });
      return result.text || "I couldn't generate a response.";
  } catch (e: any) {
      console.error("Chat Error", e);
      return "Error generating chat response: " + e.message;
  }
};
