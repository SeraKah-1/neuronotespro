
/**
 * DETERMINISTIC FORMATTER
 * 
 * A pure logic-based processor to sanitize AI output without relying on self-correction.
 * Focuses heavily on fixing broken Mermaid.js syntax and Obsidian-style callouts.
 */

/* --- 1. MERMAID SYNTAX REPAIR --- */

const fixMermaidArrows = (line: string): string => {
  let fixed = line;

  // 1. Fix Standard Arrows (-->)
  fixed = fixed.replace(/-\s+-\s+>/g, '-->'); 
  fixed = fixed.replace(/-\s+->/g, '-->');
  fixed = fixed.replace(/--\s+>/g, '-->');
  fixed = fixed.replace(/-\s+>/g, '-->');

  // 2. Fix Dotted Arrows (-.->)
  fixed = fixed.replace(/-\s+\.\s+->/g, '-.->');
  fixed = fixed.replace(/-\.\s+->/g, '-.->');
  fixed = fixed.replace(/-\.-\s+>/g, '-.->');

  // 3. Fix Thick Arrows (==>)
  fixed = fixed.replace(/=\s+=\s+>/g, '==>');
  fixed = fixed.replace(/==\s+>/g, '==>');
  fixed = fixed.replace(/=\s+=>/g, '==>');

  return fixed;
};

const sanitizeNodeLabels = (line: string): string => {
  if (line.trim().startsWith('style') || line.trim().startsWith('classDef') || line.trim().startsWith('subgraph') || line.trim().startsWith('click')) {
    return line;
  }

  // AGGRESSIVE NODE SANITIZER
  // Goal: Convert A[Text (Complex)] -> A["Text (Complex)"]
  // Regex Explanation:
  // ([a-zA-Z0-9_]+) -> ID
  // \s*             -> space
  // (\[|\(|\{)      -> Open bracket
  // (?!["'])        -> Lookahead: Don't match if already quoted
  // (.*?)           -> Content (non-greedy)
  // (?!["'])        -> Lookahead: Don't match if already quoted
  // (\]|\)|\})      -> Close bracket
  
  let fixed = line;

  // Function to wrap content in quotes if not already wrapped
  const replacer = (match: string, id: string, open: string, content: string, close: string) => {
      // Check if content is already wrapped in quotes to be safe
      const trimmed = content.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
          return match;
      }
      
      // Escape internal double quotes
      const safeContent = content.replace(/"/g, "'");
      return `${id}${open}"${safeContent}"${close}`;
  };

  // 1. Square Brackets [ ]
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[([^\]]+)\]/g, (match, id, content) => replacer(match, id, '[', content, ']'));

  // 2. Round Brackets ( ) - Note: We skip ((Circle)) double brackets to avoid breaking them
  // We use a specific regex that avoids matching double (( 
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\((?!\()([^)]+)\)/g, (match, id, content) => replacer(match, id, '(', content, ')'));

  // 3. Database/Cylinder [( )]
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[\(([^)]+)\)\]/g, (match, id, content) => replacer(match, id, '[(', content, ')]'));

  return fixed;
};

/* --- MINDMAP SPECIFIC HANDLER --- */
const fixMindmap = (content: string): string => {
  const lines = content.split('\n');
  const validLines = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('%%') && !l.trim().startsWith('```'));
  
  let bodyLines = validLines;
  if (validLines.length > 0 && validLines[0].trim().includes('mindmap')) {
    bodyLines = validLines.slice(1);
  }

  if (bodyLines.length === 0) return "```mermaid\nmindmap\n  root((Empty))\n```";

  // Check for Multiple Roots Violation
  const firstLineMatch = bodyLines[0].match(/^(\s*)/);
  const rootIndentLen = firstLineMatch ? firstLineMatch[1].length : 0;

  const rootCandidates = bodyLines.filter(l => {
    const m = l.match(/^(\s*)/);
    const indent = m ? m[1].length : 0;
    return indent <= rootIndentLen;
  });

  let header = "mindmap";
  let processedLines: string[] = [];

  if (rootCandidates.length > 1) {
    header = "mindmap\n  root((Overview))"; 
    processedLines = bodyLines.map(l => "    " + l.trimStart());
  } else {
    header = "mindmap";
    processedLines = bodyLines;
  }

  return "```mermaid\n" + header + "\n" + processedLines.join('\n') + "\n```";
};

const fixMermaidBlock = (codeBlock: string): string => {
  const firstLine = codeBlock.trim().split('\n')[0].trim();
  
  if (firstLine.includes('mindmap')) {
    return fixMindmap(codeBlock);
  }

  if (firstLine.includes('sequenceDiagram') || firstLine.includes('timeline') || firstLine.includes('quadrantChart') || firstLine.includes('classDiagram')) {
    return "```mermaid\n" + codeBlock.trim() + "\n```";
  }

  // STANDARD FLOWCHART / GRAPH HANDLER
  const lines = codeBlock.split('\n');
  const fixedLines: string[] = [];

  for (let line of lines) {
    let trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('%%')) {
      fixedLines.push(line);
      continue;
    }

    // Remove hallucinations (List numbers at start)
    trimmed = trimmed.replace(/^[\d\.\-\*\+]+(?=\s*[a-zA-Z])/, '').trim();

    // Fix merged headers
    trimmed = trimmed.replace(/^(graph|flowchart)\s+(TD|LR|TB|BT)([a-zA-Z0-9])/, '$1 $2\n$3');

    // Fix Arrows
    trimmed = fixMermaidArrows(trimmed);

    // Sanitize Labels (The Critical Fix)
    trimmed = sanitizeNodeLabels(trimmed);

    fixedLines.push(trimmed);
  }

  return "```mermaid\n" + fixedLines.join('\n') + "\n```";
};

/* --- 2. OBSIDIAN TAG CONVERTER --- */

const cleanAndQuoteContent = (content: string): string => {
  const lines = content.trim().split('\n');
  return lines.map(line => line.trim() === "" ? ">" : `> ${line}`).join('\n');
};

const convertTagsToObsidian = (text: string): string => {
  const tagMap: Record<string, { type: string; icon: string }> = {
    'DEEP': { type: 'note', icon: '👁️' },
    'CLINIC': { type: 'tip', icon: '💊' },
    'ALERT': { type: 'warning', icon: '⚠️' },
    'INFO': { type: 'info', icon: 'ℹ️' },
    'TABLE': { type: 'example', icon: '📊' },
    'QUESTION': { type: 'question', icon: '❓' },
    'QUOTE': { type: 'quote', icon: '💬' }
  };

  let processedText = text.replace(/<<<CLICNIC_END>>>/g, '<<<CLINIC_END>>>');

  for (const [tagName, config] of Object.entries(tagMap)) {
    const pattern = new RegExp(`<<<${tagName}_START>>>([\\s\\S]*?)<<<${tagName}_END>>>`, 'g');
    
    processedText = processedText.replace(pattern, (match, content) => {
      let cleanContent = content.trim();
      let title = config.type.toUpperCase();
      
      const titleMatch = cleanContent.match(/^\[(.*?)\]/);
      if (titleMatch) {
          title = titleMatch[1];
          cleanContent = cleanContent.substring(titleMatch[0].length).trim();
      }

      const formattedBody = cleanAndQuoteContent(cleanContent);
      return `> [!${config.type}]- ${config.icon} **${title}**\n${formattedBody}`;
    });
  }

  return processedText;
};

/* --- MAIN PROCESSOR --- */

export const processGeneratedNote = (rawText: string): string => {
  const mermaidBlockRegex = /```mermaid([\s\S]*?)```/g;
  let processed = rawText.replace(mermaidBlockRegex, (match, code) => fixMermaidBlock(code));

  processed = processed.replace(/-{4,}/g, '---');
  processed = convertTagsToObsidian(processed);

  return processed;
};
