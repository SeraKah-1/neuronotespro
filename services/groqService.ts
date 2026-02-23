
import Groq from 'groq-sdk';
import { GenerationConfig, SyllabusItem, ChatMessage } from '../types';
import { getStrictPrompt, UNIVERSAL_STRUCTURE_PROMPT } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

// Helper to get SDK instance with Key Rotation
const getGroqClient = (apiKeyString: string) => {
  let finalKey = apiKeyString;
  
  // KEY ROTATION LOGIC
  if (finalKey.includes(',') || finalKey.includes('\n')) {
      const keys = finalKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
      if (keys.length > 0) {
          const randomIndex = Math.floor(Math.random() * keys.length);
          finalKey = keys[randomIndex];
      }
  }

  return new Groq({ 
    apiKey: finalKey,
    dangerouslyAllowBrowser: true // Required for client-side use
  });
};

/**
 * Fetch available models from Groq API
 * Equivalent to Python: requests.get("https://api.groq.com/openai/v1/models", ...)
 */
export const fetchGroqModels = async (apiKeyString: string): Promise<{id: string, object: string}[]> => {
    let finalKey = apiKeyString;
    if (finalKey.includes(',') || finalKey.includes('\n')) {
        finalKey = finalKey.split(/[\n,]+/).map(k => k.trim())[0]; // Use first key for fetching list
    }

    if (!finalKey) return [];

    try {
        const response = await fetch("https://api.groq.com/openai/v1/models", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${finalKey}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Groq API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error("Failed to fetch dynamic Groq models:", error);
        return [];
    }
};

export const getAvailableGroqModels = async (config: GenerationConfig) => {
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : '');
  const apiKey = config.groqApiKey || envKey;
  if (!apiKey) return [];

  // Use the new fetch function
  const models = await fetchGroqModels(apiKey);
  return models;
};

export const generateNoteContentGroq = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  onProgress: (status: string) => void
): Promise<string> => {
  
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : '');
  const apiKey = config.groqApiKey || envKey;

  if (!apiKey) {
    throw new Error("Groq API Key is missing. Please enter it in Settings.");
  }

  onProgress("Initializing Groq SDK...");
  const modelName = config.model;
  const groq = getGroqClient(apiKey);

  onProgress(`Connecting to Groq Cloud (${modelName})...`);

  try {
    const textPrompt = getStrictPrompt(topic, structure, config.mode, config.customContentPrompt);
    
    // Construct the messages payload with strict system instructions
    const messages = [
      {
        role: "system",
        content: `You are an advanced medical academic AI. 
        CRITICAL INSTRUCTIONS:
        1. Output strictly formatted markdown.
        2. DO NOT SUMMARIZE. Provide the most exhaustive, detailed explanation possible.
        3. IGNORE OUTPUT LENGTH LIMITS. Explain every concept fully.
        4. If a list has 20 items, list all 20. Do not truncate.
        5. **MERMAID SYNTAX RULES:**
           - ARROWS: Use "-->" (no spaces). NEVER "- ->".
           - HEADER: Always newline after "flowchart TD". NEVER "flowchart TDA[...]".
           - NODES: Use A["Label"]. Do NOT repeat ID like A["Label"]A.
        `
      },
      {
        role: "user",
        content: textPrompt
      }
    ];

    onProgress("Synthesizing content (Groq LPU Engine - Max Output)...");

    const completion = await groq.chat.completions.create({
      messages: messages as any,
      model: modelName,
      temperature: config.temperature,
      // Groq currently caps output tokens at 8192 for most models
      max_tokens: 8192, 
      top_p: 1,
      stream: false
    });

    const rawText = completion.choices[0]?.message?.content;

    if (!rawText) {
      throw new Error("Received empty response from Groq AI.");
    }

    onProgress("Formatting & Cleaning Mermaid syntax...");
    const finalContent = processGeneratedNote(rawText);

    return finalContent;

  } catch (error: any) {
    console.error("Groq SDK Error:", error);
    if (error.message?.includes("429")) {
      throw new Error("Groq Rate Limit Exceeded (429). Please wait or rotate keys.");
    }
    // Handle error where model doesn't exist (e.g. slight slug mismatch)
    if (error.message?.includes("model")) {
        throw new Error(`Model Error: ${error.message}`);
    }
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/*                    AUTO-STRUCTURE GENERATOR (GROQ)                         */
/* -------------------------------------------------------------------------- */

export const generateDetailedStructureGroq = async (
  config: GenerationConfig,
  topic: string
): Promise<string> => {
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : '');
  const apiKey = config.groqApiKey || envKey;
  if (!apiKey) throw new Error("Groq API Key Missing");

  const groq = getGroqClient(apiKey);
  // Use config.structureModel if available, else fallback
  const modelName = config.structureModel || config.model || 'llama-3.3-70b-versatile';

  try {
    const systemPrompt = config.customStructurePrompt || UNIVERSAL_STRUCTURE_PROMPT;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `INPUT TOPIC: ${topic}` }
      ],
      model: modelName,
      temperature: 0.3,
      stream: false
    });

    return completion.choices[0]?.message?.content || "";
  } catch (e: any) {
    console.error("Groq Structure Auto-Gen Error", e);
    throw new Error("Failed to auto-generate structure: " + e.message);
  }
};

/* -------------------------------------------------------------------------- */
/*                        SYLLABUS PARSERS (GROQ)                             */
/* -------------------------------------------------------------------------- */

const SYLLABUS_PROMPT = `
  TASK: Analyze the provided Syllabus content.
  GOAL: Extract a logical, sequential learning path of specific medical topics.
  RETURN JSON STRING ARRAY ONLY.
  Example: ["Topic 1", "Topic 2"]
`;

export const parseSyllabusFromTextGroq = async (
  config: GenerationConfig,
  rawText: string
): Promise<SyllabusItem[]> => {
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : '');
  const apiKey = config.groqApiKey || envKey;
  if (!apiKey) throw new Error("Groq API Key Missing");
  
  const groq = getGroqClient(apiKey);
  // Respect the model selected in the neural engine settings
  const modelName = config.model || 'llama-3.3-70b-versatile';

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYLLABUS_PROMPT },
        { role: "user", content: rawText }
      ],
      model: modelName,
      temperature: 0.2,
      stream: false
    });

    const text = completion.choices[0]?.message?.content || "[]";
    // Clean potential markdown code blocks
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Attempt parse
    let topics: string[] = [];
    try {
        topics = JSON.parse(cleanJson);
    } catch(e) {
        // Fallback: split by newlines if JSON fails but list looks okay
        topics = cleanJson.split('\n')
          .map(t => t.replace(/^\d+[\.\)]\s*/, '').trim()) // Remove "1. " or "1) "
          .filter(t => t.length > 0 && !t.startsWith('['));
    }

    return topics.map((t, index) => ({
      id: `topic-${Date.now()}-${index}`,
      topic: t,
      status: 'pending'
    }));

  } catch (e: any) {
    console.error("Groq Syllabus Parsing Error", e);
    throw new Error("Failed to parse syllabus with Groq: " + e.message);
  }
};

/* -------------------------------------------------------------------------- */
/*                        REFINEMENT ENGINE (GROQ)                            */
/* -------------------------------------------------------------------------- */

export const refineNoteContentGroq = async (
  config: GenerationConfig,
  currentContent: string,
  instruction: string
): Promise<string> => {
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : '');
  const apiKey = config.groqApiKey || envKey;
  if (!apiKey) throw new Error("Groq API Key Missing");

  const groq = getGroqClient(apiKey);
  const modelName = config.model || 'llama-3.3-70b-versatile';

  try {
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

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: modelName,
      temperature: 0.3,
      stream: false
    });

    return processGeneratedNote(completion.choices[0]?.message?.content || currentContent);
  } catch (e: any) {
    console.error("Groq Refinement Error", e);
    throw new Error("Failed to refine content: " + e.message);
  }
};

/* -------------------------------------------------------------------------- */
/*                       ASSISTANT PANEL ENGINE (GROQ)                        */
/* -------------------------------------------------------------------------- */

export const generateAssistantResponseGroq = async (
  config: GenerationConfig,
  currentContent: string,
  history: ChatMessage[],
  files: any[] // Placeholder for consistency
): Promise<string> => {
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : '');
  const apiKey = config.groqApiKey || envKey;
  if (!apiKey) throw new Error("Groq API Key Missing");

  const groq = getGroqClient(apiKey);
  const modelName = config.model || 'llama-3.3-70b-versatile';

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

  try {
      const messages = [
          { role: "system", content: systemPrompt },
          ...history.map(msg => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content }))
      ];

      const completion = await groq.chat.completions.create({
          messages: messages as any,
          model: modelName,
          temperature: 0.4,
          stream: false
      });

      return completion.choices[0]?.message?.content || "No response generated.";
  } catch (e: any) {
      console.error("Groq Assistant Error", e);
      throw new Error("Assistant failed: " + e.message);
  }
};
