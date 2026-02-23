
import { GoogleGenAI } from "@google/genai";
import { GenerationConfig, UploadedFile, SyllabusItem, ChatMessage, NoteMode } from '../types';
import { getStrictPrompt, UNIVERSAL_STRUCTURE_PROMPT } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

// Helper to get authenticated AI instance with Key Rotation
const getAIClient = (config: GenerationConfig) => {
  // SAFE ENV ACCESS
  const envKey = (import.meta as any).env?.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '');
  let apiKey = config.apiKey || envKey;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please unlock with your NeuroKey Card or check Settings.");
  }

  // KEY ROTATION LOGIC
  // Support comma-separated or newline-separated keys
  if (apiKey.includes(',') || apiKey.includes('\n')) {
      const keys = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
      if (keys.length > 0) {
          // Pick a random key for simple load balancing
          const randomIndex = Math.floor(Math.random() * keys.length);
          apiKey = keys[randomIndex];
      }
  }

  return new GoogleGenAI({ apiKey });
};

// --- BATCH GENERATOR FOR COMPREHENSIVE MODE ---
const generateBatchSection = async (
  ai: GoogleGenAI,
  config: GenerationConfig,
  topic: string,
  sectionTitle: string,
  sectionContext: string, // New: Pass sub-bullets as context
  files: UploadedFile[]
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

  // Use higher token limit and slightly lower temp for academic precision
  const response = await ai.models.generateContent({
      model: config.model, // Recommend Gemini 1.5 Pro or 2.5 Pro for this
      contents: { parts },
      config: { temperature: 0.2, maxOutputTokens: 8192 } 
  });
  
  return response.text || `(Failed to generate ${sectionTitle})`;
};

export const generateNoteContent = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  files: UploadedFile[],
  onProgress: (status: string) => void
): Promise<string> => {
  
  onProgress("Checking configurations...");
  const ai = getAIClient(config);
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
                           files
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
    if (error.message?.includes("429")) {
      throw new Error("Quota Exceeded (429). Please wait a moment or rotate keys.");
    }
    // Handle 404 specifically for clearer UX
    if (error.message?.includes("404")) {
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
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const topics: string[] = JSON.parse(cleanJson);

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
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const topics: string[] = JSON.parse(cleanJson);

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

/* -------------------------------------------------------------------------- */
/*                       ASSISTANT PANEL ENGINE                               */
/* -------------------------------------------------------------------------- */

export const generateAssistantResponse = async (
  config: GenerationConfig,
  currentContent: string,
  history: ChatMessage[],
  files: UploadedFile[]
): Promise<string> => {
  const ai = getAIClient(config);
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-3-flash-preview';

  const systemPrompt = `
  ROLE: Intelligent Medical Assistant (Neuro-Sidekick).
  CONTEXT: The user is working on a medical note.
  CURRENT NOTE CONTENT:
  """
  ${currentContent.substring(0, 20000)} ... (truncated)
  """

  INSTRUCTION:
  - Provide a direct, high-quality response to the user's request.
  - If asked to add content, write it in Markdown format matching the note's style.
  - If asked to summarize, provide a concise summary.
  - Do NOT repeat the user's prompt.

  *** TOOL CAPABILITIES ***
  - You can create sticky notes for the user. 
  - To create a sticky note, output: {{STICKY: content}} or {{STICKY|color: content}} (colors: yellow, blue, green, pink).
  - Example: {{STICKY|blue: Review this mechanism later}}
  `;

  // Convert history to Gemini format
  // System prompt goes to systemInstruction or first content part?
  // For Gemini 1.5/Pro, systemInstruction is preferred in config.
  // But here we are using generateContent (single turn) or chats.create (multi turn).
  // Let's use chats.create for true history support.

  try {
      const chat = ai.chats.create({
          model: modelName,
          config: {
              systemInstruction: systemPrompt,
              temperature: 0.4,
          },
          history: history.slice(0, -1).map(msg => ({
              role: msg.role,
              parts: [{ text: msg.content }]
          }))
      });

      const lastMessage = history[history.length - 1];
      const parts: any[] = [{ text: lastMessage.content }];
      
      if (files && files.length > 0) {
          files.forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
      }

      const result = await chat.sendMessage({ message: parts });
      return result.text || "No response generated.";

  } catch (e: any) {
      console.error("Assistant Error", e);
      // Fallback to single turn if chat fails (e.g. some models might have issues)
      // Or just throw
      throw new Error("Assistant failed: " + e.message);
  }
};
