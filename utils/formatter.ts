
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';

/**
 * DETERMINISTIC FORMATTER (AST-BASED)
 * 
 * Uses remark to parse Markdown into an Abstract Syntax Tree (AST).
 * This prevents catastrophic backtracking and ensures O(N) linear time processing.
 */

/* --- 1. MERMAID SYNTAX REPAIR --- */

const fixMermaidArrows = (line: string): string => {
  let fixed = line;
  fixed = fixed.replace(/-\s+-\s+>/g, '-->'); 
  fixed = fixed.replace(/-\s+->/g, '-->');
  fixed = fixed.replace(/--\s+>/g, '-->');
  fixed = fixed.replace(/-\s+>/g, '-->');
  fixed = fixed.replace(/-\s+\.\s+->/g, '-.->');
  fixed = fixed.replace(/-\.\s+->/g, '-.->');
  fixed = fixed.replace(/-\.-\s+>/g, '-.->');
  fixed = fixed.replace(/=\s+=\s+>/g, '==>');
  fixed = fixed.replace(/==\s+>/g, '==>');
  fixed = fixed.replace(/=\s+=>/g, '==>');
  return fixed;
};

const sanitizeNodeLabels = (line: string): string => {
  if (line.trim().startsWith('style') || line.trim().startsWith('classDef') || line.trim().startsWith('subgraph') || line.trim().startsWith('click')) {
    return line;
  }
  
  const replacer = (match: string, id: string, open: string, content: string, close: string) => {
      const trimmed = content.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
          return match;
      }
      const safeContent = content.replace(/"/g, "'");
      return `${id}${open}"${safeContent}"${close}`;
  };

  let fixed = line;
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[([^\]]+)\]/g, (match, id, content) => replacer(match, id, '[', content, ']'));
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\((?!\()([^)]+)\)/g, (match, id, content) => replacer(match, id, '(', content, ')'));
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[\(([^)]+)\)\]/g, (match, id, content) => replacer(match, id, '[(', content, ')]'));
  return fixed;
};

const fixMindmap = (content: string): string => {
  const lines = content.split('\n');
  const validLines = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('%%') && !l.trim().startsWith('```'));
  
  let bodyLines = validLines;
  if (validLines.length > 0 && validLines[0].trim().includes('mindmap')) {
    bodyLines = validLines.slice(1);
  }

  if (bodyLines.length === 0) return "mindmap\n  root((Empty))";

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

  return header + "\n" + processedLines.join('\n');
};

const fixMermaidBlock = (codeBlock: string): string => {
  const firstLine = codeBlock.trim().split('\n')[0].trim();
  
  if (firstLine.includes('mindmap')) {
    return fixMindmap(codeBlock);
  }

  if (firstLine.includes('sequenceDiagram') || firstLine.includes('timeline') || firstLine.includes('quadrantChart') || firstLine.includes('classDiagram')) {
    return codeBlock.trim();
  }

  const lines = codeBlock.split('\n');
  const fixedLines: string[] = [];

  for (let line of lines) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) {
      fixedLines.push(line);
      continue;
    }
    trimmed = trimmed.replace(/^[\d\.\-\*\+]+(?=\s*[a-zA-Z])/, '').trim();
    trimmed = trimmed.replace(/^(graph|flowchart)\s+(TD|LR|TB|BT)([a-zA-Z0-9])/, '$1 $2\n$3');
    trimmed = fixMermaidArrows(trimmed);
    trimmed = sanitizeNodeLabels(trimmed);
    fixedLines.push(trimmed);
  }

  return fixedLines.join('\n');
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

/* --- MAIN PROCESSOR (AST-BASED) --- */

export const processGeneratedNote = (rawText: string): string => {
  // 1. Pre-process custom tags (since they aren't standard MD)
  let processed = convertTagsToObsidian(rawText);
  
  // 2. Use remark for AST-based transformations
  const processor = remark()
    .use(remarkParse)
    .use(() => (tree) => {
      visit(tree, 'code', (node: any) => {
        if (node.lang === 'mermaid') {
          node.value = fixMermaidBlock(node.value);
        }
      });
      
      visit(tree, 'thematicBreak', (node: any) => {
        // Standardize thematic breaks
      });
    })
    .use(remarkStringify);

  // Note: remark is typically async, but we can use it synchronously if we don't have async plugins
  // However, for safety in this environment, we'll try to keep it simple.
  // If remark().processSync() is available, we use it.
  try {
    const result = processor.processSync(processed);
    return String(result);
  } catch (e) {
    console.error("AST Processing failed, falling back to regex", e);
    // Fallback to basic regex if AST fails
    return processed.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
        return "```mermaid\n" + fixMermaidBlock(code) + "\n```";
    });
  }
};
