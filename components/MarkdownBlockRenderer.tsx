
import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import Mermaid from './Mermaid';
import { MarkdownBlock } from '../utils/markdownParser';

interface MarkdownBlockRendererProps {
  block: MarkdownBlock;
  sensorMode: boolean;
  onMermaidChange?: (oldCode: string, newCode: string) => void;
}

const SensorBlock: React.FC<{ children: React.ReactNode; active: boolean; label?: string }> = React.memo(({ children, active, label }) => {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!active) setRevealed(true);
    else setRevealed(false);
  }, [active]);

  if (!active) return <div className="mb-4">{children}</div>;

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
      className={`relative mb-4 transition-all duration-500 ${revealed ? 'sensor-blur revealed' : 'sensor-blur'}`}
    >
       {!revealed && (
         <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-[var(--ui-text-muted)] text-[10px] font-bold uppercase tracking-widest opacity-50">
               {label || 'Click to Reveal'}
            </div>
         </div>
       )}
       {children}
    </div>
  );
});

const MarkdownBlockRenderer: React.FC<MarkdownBlockRendererProps> = ({ block, sensorMode, onMermaidChange }) => {
  const node = block.raw;

  if (node.type === 'code' && node.lang === 'mermaid') {
    return (
      <SensorBlock active={sensorMode} label="Reveal Diagram">
        <Mermaid 
          chart={node.value} 
          onChartChange={(newCode) => onMermaidChange?.(node.value, newCode)}
        />
      </SensorBlock>
    );
  }

  if (node.type === 'code') {
    return (
      <SensorBlock active={sensorMode} label="Reveal Code">
        <div className="group relative my-4 rounded-lg overflow-hidden border border-[var(--md-border)] bg-[var(--md-code-bg)] text-[var(--md-text)] shadow-sm text-sm p-4">
          <pre className="overflow-x-auto custom-scrollbar">
            <code className={`language-${node.lang || ''}`}>{node.value}</code>
          </pre>
        </div>
      </SensorBlock>
    );
  }

  const content = useMemo(() => {
    if (node.type === 'heading') {
      const level = node.depth;
      const text = node.children.map((c: any) => c.value || '').join('');
      return `${'#'.repeat(level)} ${text}`;
    }
    // ... other node types ...
    // For simplicity, we can use a generic stringifier or just pass the node to ReactMarkdown
    // But ReactMarkdown expects a string. 
    // We can use mdast-util-to-markdown if we had it, but we can also just use node.value if it exists
    return node.value || '';
  }, [node]);

  // If it's a complex node (like a list or paragraph with children), we might need a better way to stringify
  // For now, let's just use a simple fallback for common types
  const markdown = useMemo(() => {
    if (node.type === 'paragraph' || node.type === 'list' || node.type === 'blockquote') {
      // This is a hacky way to get the markdown back from the node
      // In a real app, we'd use mdast-util-to-markdown
      // But we can try to reconstruct simple ones
      const reconstruct = (n: any): string => {
        if (n.type === 'text') return n.value;
        if (n.type === 'strong') return `**${n.children.map(reconstruct).join('')}**`;
        if (n.type === 'emphasis') return `*${n.children.map(reconstruct).join('')}*`;
        if (n.type === 'link') return `[${n.children.map(reconstruct).join('')}](${n.url})`;
        if (n.type === 'inlineCode') return `\`${n.value}\``;
        if (n.children) return n.children.map(reconstruct).join('');
        return n.value || '';
      };
      
      let res = reconstruct(node);
      if (node.type === 'list') {
        res = node.children.map((li: any) => `* ${li.children.map(reconstruct).join('')}`).join('\n');
      }
      if (node.type === 'blockquote') {
        res = `> ${res}`;
      }
      return res;
    }
    
    if (node.type === 'heading') {
      const text = node.children.map((c: any) => c.value || '').join('');
      return `${'#'.repeat(node.depth)} ${text}`;
    }

    return node.value || '';
  }, [node]);

  return (
    <div className="markdown-block py-1" id={node.type === 'heading' ? `header-${block.id}` : undefined}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownBlockRenderer);
