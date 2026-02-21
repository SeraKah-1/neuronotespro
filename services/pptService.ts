import { GoogleGenAI } from "@google/genai";
import { UploadedFile, GenerationConfig } from "../types";

// Helper to get AI client (reused from geminiService logic)
const getAIClient = (config: GenerationConfig) => {
  return new GoogleGenAI({ apiKey: config.apiKey });
};

export const processPPTWithGemini = async (
  config: GenerationConfig,
  file: UploadedFile
): Promise<string> => {
  const ai = getAIClient(config);
  
  // Use a model capable of multimodal understanding (Flash 2.0/2.5 is great for this)
  // Fallback to 1.5 Flash if 2.0 not available in config, but prefer 2.0 for vision
  const modelName = config.model.includes('gemini') ? config.model : 'gemini-2.5-flash';

  try {
    console.log(`Processing PPT ${file.name} with ${modelName}...`);

    const prompt = `
    TASK: Extract and summarize the content of this presentation slide deck.
    
    INSTRUCTIONS:
    1. READ every slide visible in the file.
    2. EXTRACT the key text, bullet points, and data.
    3. DESCRIBE any important diagrams or charts briefly.
    4. OUTPUT the result as a structured Markdown text.
       - Use "## Slide [Number]: [Title]" for each slide.
       - Use bullet points for content.
    
    GOAL: Create a text representation of this presentation that can be used for studying.
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: file.mimeType, // e.g., 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
              data: file.data // Base64 string
            }
          }
        ]
      },
      config: {
        temperature: 0.2,
        maxOutputTokens: 8192 // Large output for full decks
      }
    });

    return response.text || "(No text extracted from PPT)";

  } catch (error: any) {
    console.error("PPT Processing Error:", error);
    throw new Error(`Failed to process PPT: ${error.message}`);
  }
};
