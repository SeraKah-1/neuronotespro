
import { GoogleGenAI, Type } from "@google/genai";
import { GenerationConfig, UploadedFile, SyllabusItem, ChatMessage, NoteMode } from '../types';
import { getStrictPrompt, UNIVERSAL_STRUCTURE_PROMPT } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';
import { safeParseArray } from '../utils/jsonUtils';

import { connectionManager } from './AIConnectionManager';

// Helper to get authenticated AI instance with Key Rotation
const getAIClient = (config: GenerationConfig) => {
  // SAFE ENV ACCESS
  const envKey = (import.meta as any).env?.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '');
  let apiKey = config.apiKey || envKey;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please unlock with your NeuroKey Card or check Settings.");
  }

  // KEY ROTATION LOGIC
  let keys = [apiKey];
  if (apiKey.includes(',') || apiKey.includes('\n')) {
      keys = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  }
  
  connectionManager.setKeys(keys);
  const activeKey = connectionManager.getKey();

  return { ai: new GoogleGenAI({ apiKey: activeKey }), activeKey };
};

// --- BATCH GENERATOR FOR COMPREHENSIVE MODE ---
const generateBatchSection = async (
  ai: GoogleGenAI,
  config: GenerationConfig,
  topic: string,
  sectionTitle: string,
  sectionContext: string, // New: Pass sub-bullets as context
  files: UploadedFile[],
  activeKey: string
): Promise<string> => {
  
  // AGGRESSIVE ACADEMIC PROMPT
  const prompt = `
  CONTEXT: We are writing a Medical Textbook Chapter on "${topic}".
  
  CURRENT SECTION TO WRITE:
  "${sectionTitle}"
  
  SUB-TOPICS TO COVER IN THIS SECTION:
  ${sectionContext}
  
  ***CRITICAL WRITING INSTRUCTIONS (STRICT)***:
  1. **LENGTH & DEPTH:** Do NOT summarize. This must be a "Deep Dive". Write at least 800-1200 words for this section alone if possible.
  2. **STRUCTURE:**
     - Start with a functional definition (Analogy + Mechanism).
     - Explain the PATHOPHYSIOLOGY in extreme detail (Molecular/Cellular level).
     - Provide CLINICAL CORRELATIONS (Why does this matter?).
     - Include a specific PHARMACOLOGY subsection if relevant (Mechanism of Action).
  3. **FORMATTING:**
     - Use Bold for key terms.
     - Use Tables for comparisons.
     - Use ">>>" for clinical pearls.
  4. **NO HALLUCINATIONS:** If you don't know a specific detail, state general principles, but do not invent data.
  
  ${config.customContentPrompt ? `USER SPECIAL INSTRUCTION: ${config.customContentPrompt}` : ''}
  
  OUTPUT THE CONTENT FOR THIS SECTION ONLY. DO NOT REPEAT THE MAIN TITLE.
  `;

  const parts: any[] = [{ text: prompt }];
  if (files && files.length > 0) {
      files.forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
  }

  try {
    // Use higher token limit and slightly lower temp for academic precision
    const response = await ai.models.generateContent({
        model: config.model, // Recommend Gemini 1.5 Pro or 2.5 Pro for this
        contents: { parts },
        config: { temperature: 0.2, maxOutputTokens: 8192 } 
    });
    
    return response.text || `(Failed to generate ${sectionTitle})`;
  } catch (error: any) {
    const statusMatch = error.message?.match(/\[(\d{3})\]/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 500;
    connectionManager.reportError(activeKey, status);
    throw error;
  }
};

export const generateNoteContent = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  files: UploadedFile[],
  onProgress: (status: string) => void
): Promise<string> => {
  
  onProgress("Checking configurations...");
  const { ai, activeKey } = getAIClient(config);
  const modelName = config.model;

  onProgress(`Connecting to ${modelName} in ${config.mode.toUpperCase()} mode...`);

  try {
    // --- 1. COMPREHENSIVE MODE: SEQUENTIAL BATCH GENERATION ---
    if (config.mode === NoteMode.COMPREHENSIVE) {
       onProgress("COMPREHENSIVE MODE: Analyzing Blueprint Structure...");
       
       // IMPROVED SPLITTING LOGIC (ROBUST): 
       // Split by top-level headers (# or ##)
       const rawSections = structure.split(/(?=^#{1,2}\s)/gm).filter(s => s.trim().length > 0);
       
       let fullContent = `> [!abstract] COMPREHENSIVE TEXTBOOK: ${topic.toUpperCase()}\n\n`;
       fullContent += `_Generated via NeuroNote Batch Engine (${rawSections.length} Sections)_\n\n---\n\n`;

       // Robust Loop: Don't let one failure stop the whole book
       for (let i = 0; i < rawSections.length; i++) {
           const rawText = rawSections[i].trim();
           
           try {
               // Extract Title (first line) vs Context (rest of the text)
               const lines = rawText.split('\n');
               const sectionTitle = lines[0].replace(/^#+\s*/, '').trim();
               const sectionContext = lines.slice(1).join('\n').trim();

               // Skip empty headers or "Introduction" if it's too short
               if (lines.length < 2 && rawSections.length > 3 && sectionTitle.toLowerCase().includes('intro')) {
                   // Optional skip logic
               }

               onProgress(`[Batch ${i+1}/${rawSections.length}] Researching & Writing: "${sectionTitle}"...`);
               
               // Generate specific section with internal retry
               let sectionContent = "";
               let attempts = 0;
               while (attempts < 2 && !sectionContent) {
                   try {
                       sectionContent = await generateBatchSection(
                           ai, 
                           config, 
                           topic, 
                           sectionTitle, 
                           sectionContext || "Cover all standard aspects of this sub-topic.", 
                           files,
                           activeKey
                       );
                   } catch (err) {
                       attempts++;
                       console.warn(`Batch attempt ${attempts} failed for ${sectionTitle}`, err);
                       await new Promise(r => setTimeout(r, 2000)); // Wait before retry
                   }
               }
               
               if (!sectionContent) sectionContent = "> [!danger] GENERATION FAILED FOR THIS SECTION.";

               // Append with a clear divider
               fullContent += `\n# ${sectionTitle}\n\n${sectionContent}\n\n`;
               
               // Rate Limit Buffer
               await new Promise(r => setTimeout(r, 1500));

           } catch (batchError) {
               console.error(`Error processing batch ${i}:`, batchError);
               fullContent += `\n> [!warning] Skipped Section due to error.\n\n`;
           }
       }

       onProgress("Finalizing & Formatting Textbook...");
       return processGeneratedNote(fullContent);
    }

    // --- 2. STANDARD MODES (General, Cheat Sheet) ---
    const textPrompt = getStrictPrompt(topic, structure, config.mode, config.customContentPrompt);
    
    const parts: any[] = [{ text: textPrompt }];

    if (files && files.length > 0) {
      onProgress(`Processing ${files.length} attachment(s)...`);
      files.forEach(file => {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data
          }
        });
      });
    }

    onProgress("Synthesizing content (Standard Mode)...");
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        temperature: config.temperature,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 65536, 
      }
    });

    const rawText = response.text;

    if (!rawText) {
      throw new Error("Received empty response from AI.");
    }

    onProgress("Formatting & Cleaning Mermaid syntax...");
    const finalContent = processGeneratedNote(rawText);

    return finalContent;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Extract status code if possible
    const statusMatch = error.message?.match(/\[(\d{3})\]/);
    let status = statusMatch ? parseInt(statusMatch[1]) : 500;
    if (error.message?.includes("429")) status = 429;
    if (error.message?.includes("503")) status = 503;
    if (error.message?.includes("401")) status = 401;
    if (error.message?.includes("403")) status = 403;
    if (error.message?.includes("404")) status = 404;
    
    connectionManager.reportError(activeKey, status);

    if (status === 429) {
      throw new Error("Quota Exceeded (429). Please wait a moment or rotate keys.");
    }
    // Handle 404 specifically for clearer UX
    if (status === 404) {
       throw new Error(`Model not found (404). The model '${config.model}' may not be available in your account/region or the API Key is invalid.`);
    }
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/*                    AUTO-STRUCTURE GENERATOR                                */
/* -------------------------------------------------------------------------- */

export const generateDetailedStructure = async (
  config: GenerationConfig,
  topic: string
): Promise<string> => {
  const { ai, activeKey } = getAIClient(config);
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
    const statusMatch = e.message?.match(/\[(\d{3})\]/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 500;
    connectionManager.reportError(activeKey, status);
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
  const { ai, activeKey } = getAIClient(config);
  // Use config.model if it seems valid for Gemini
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: SYLLABUS_PROMPT },
          {
            inlineData: {
              mimeType: file.mimeType,
              data: file.data
            }
          }
        ]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text || "[]";
    const topics = safeParseArray<string>(text);

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Parsing Error", e);
    const statusMatch = e.message?.match(/\[(\d{3})\]/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 500;
    connectionManager.reportError(activeKey, status);
    throw new Error("Failed to parse syllabus file.");
  }
};

export const parseSyllabusFromText = async (
  config: GenerationConfig,
  rawText: string
): Promise<SyllabusItem[]> => {
  const { ai, activeKey } = getAIClient(config);
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: `${SYLLABUS_PROMPT}\n\nINPUT TEXT:\n${rawText}` }]
      },
      config: {
        temperature: 0.2, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text || "[]";
    const topics = safeParseArray<string>(text);

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Syllabus Text Parsing Error", e);
    const statusMatch = e.message?.match(/\[(\d{3})\]/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 500;
    connectionManager.reportError(activeKey, status);
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
  const { ai, activeKey } = getAIClient(config);
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
      const statusMatch = e.message?.match(/\[(\d{3})\]/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 500;
      connectionManager.reportError(activeKey, status);
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
  const { ai, activeKey } = getAIClient(config);
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
      const statusMatch = e.message?.match(/\[(\d{3})\]/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 500;
      connectionManager.reportError(activeKey, status);
      return "Error generating chat response: " + e.message;
  }
};
