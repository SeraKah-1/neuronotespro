
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// @ts-ignore
pdfMake.vfs = pdfFonts.pdfMake.vfs;

/**
 * Converts Markdown AST to pdfmake definition
 */
function ASTtoPDFDef(ast: any): any[] {
  const content: any[] = [];

  const processNode = (node: any): any => {
    switch (node.type) {
      case 'heading':
        return {
          text: node.children.map(processNode),
          style: `header${node.depth}`,
          margin: [0, 10, 0, 5] as [number, number, number, number]
        };
      case 'paragraph':
        return {
          text: node.children.map(processNode),
          margin: [0, 5, 0, 5] as [number, number, number, number]
        };
      case 'text':
        return node.value;
      case 'strong':
        return { text: node.children.map(processNode), bold: true };
      case 'emphasis':
        return { text: node.children.map(processNode), italic: true };
      case 'list':
        return {
          [node.ordered ? 'ol' : 'ul']: node.children.map((li: any) => li.children.map(processNode)),
          margin: [0, 5, 0, 5] as [number, number, number, number]
        };
      case 'code':
        if (node.lang === 'mermaid') {
          // In a real worker, we'd need a way to render mermaid to SVG/Image
          // For now, we'll just put the code or a placeholder
          return { text: `[Mermaid Diagram: ${node.value.substring(0, 50)}...]`, style: 'code' };
        }
        return { text: node.value, style: 'code', margin: [0, 5, 0, 5] as [number, number, number, number] };
      case 'blockquote':
        return {
          text: node.children.map(processNode),
          margin: [20, 5, 0, 5] as [number, number, number, number],
          color: '#666666',
          italics: true
        };
      default:
        return '';
    }
  };

  ast.children.forEach((node: any) => {
    const def = processNode(node);
    if (def) content.push(def);
  });

  return content;
}

self.onmessage = async (e: MessageEvent) => {
  const { content, topic } = e.data;

  try {
    const processor = remark().use(remarkParse);
    const ast = processor.parse(content);
    const pdfContent = ASTtoPDFDef(ast);

    const docDefinition: any = {
      content: [
        { text: topic, style: 'title' },
        ...pdfContent
      ],
      styles: {
        title: { fontSize: 24, bold: true, margin: [0, 0, 0, 20] as [number, number, number, number], color: '#1e293b' },
        header1: { fontSize: 20, bold: true, color: '#334155' },
        header2: { fontSize: 18, bold: true, color: '#475569' },
        header3: { fontSize: 16, bold: true, color: '#64748b' },
        code: { font: 'Courier', fontSize: 10, backgroundColor: '#f1f5f9', margin: [5, 5, 5, 5] as [number, number, number, number] }
      },
      defaultStyle: {
        fontSize: 12,
        lineHeight: 1.5
      }
    };

    // @ts-ignore
    pdfMake.createPdf(docDefinition).getBlob((blob) => {
      self.postMessage({ type: 'PDF_READY', blob });
    });
  } catch (error: any) {
    self.postMessage({ type: 'PDF_ERROR', error: error.message });
  }
};
