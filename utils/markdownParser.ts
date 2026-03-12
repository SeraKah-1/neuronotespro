
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

export interface MarkdownBlock {
  id: string;
  type: string;
  content: string;
  raw: any;
}

/**
 * Converts Markdown AST into a flat array of renderable blocks.
 */
export const parseMarkdownToBlocks = (markdown: string): MarkdownBlock[] => {
  const processor = remark().use(remarkParse);
  const ast = processor.parse(markdown);
  const blocks: MarkdownBlock[] = [];

  // We only want top-level children as blocks for virtualization
  ast.children.forEach((node: any, index: number) => {
    const id = `block-${index}-${node.type}`;
    
    // For most nodes, we'll stringify them back to markdown to render individually
    // or handle them as special blocks (like mermaid)
    let content = '';
    if (node.type === 'code' && node.lang === 'mermaid') {
      content = node.value;
    } else {
      // Use remark-stringify to convert node back to markdown if needed, 
      // but for virtualization we might just pass the node to a sub-renderer
      content = ''; // We'll handle rendering based on node type
    }

    blocks.push({
      id,
      type: node.type,
      content,
      raw: node
    });
  });

  return blocks;
};
