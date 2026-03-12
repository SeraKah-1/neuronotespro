/**
 * Safe JSON parsing with validation for array structures
 */
export const safeParseArray = <T>(jsonString: string, fallback: T[] = []): T[] => {
  try {
    const parsed = JSON.parse(jsonString);
    
    // If it's the Groq format {"topics": [...]}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.topics) {
      return Array.isArray(parsed.topics) ? parsed.topics : fallback;
    }
    
    // If it's a direct array
    if (Array.isArray(parsed)) {
      return parsed;
    }
    
    return fallback;
  } catch (e) {
    console.error("JSON Parse Error:", e, "Raw string:", jsonString);
    return fallback;
  }
};
