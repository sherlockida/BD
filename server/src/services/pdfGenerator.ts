// pdfmake v0.3.x uses a singleton instance pattern (not a class constructor).
// Fonts must be TrueType (.ttf) — OTF/CFF fonts trigger fontkit subsetting bugs.
import pdfmake from 'pdfmake';
import { marked } from 'marked';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Font setup ────────────────────────────────────────────────────────
// Try Noto Sans SC TTF first (cross-platform), fall back to SimHei (Windows).
const FONT_CANDIDATES = [
  { name: 'NotoSansSC', file: 'NotoSansSC-Regular.ttf' },
  { name: 'SimHei', file: 'SimHei.ttf' },
];

let fontName = 'SimHei';
let fontInited = false;

function initFont(): void {
  if (fontInited) return;
  const assetsDir = join(__dirname, '../../assets/fonts');

  for (const candidate of FONT_CANDIDATES) {
    const path = join(assetsDir, candidate.file);
    try {
      const buf = readFileSync(path);
      // Validate it's actually a font file (>100KB, TTF magic or OTF magic)
      if (buf.length < 50000) continue;
      const magic = buf.slice(0, 4).toString('ascii');
      // Accept both TTF (0x00010000) and OTF (OTTO) — OTF works with subset:false
      if (magic === '\x00\x01\x00\x00' || magic === 'OTTO' || magic === 'true' || magic === 'ttcf') {
        pdfmake.setFonts({
          [candidate.name]: {
            normal: path,
            bold: path,
            italics: path,
            bolditalics: path,
          },
        });
        fontName = candidate.name;
        fontInited = true;
        console.log(`[PDF] Font loaded: ${candidate.name} (${(buf.length / 1024).toFixed(0)}KB)`);
        return;
      }
    } catch {
      // Font file missing or unreadable; try next candidate
    }
  }

  // Last resort: try the configured path directly
  try {
    const directPath = join(assetsDir, 'SimHei.ttf');
    pdfmake.setFonts({
      SimHei: {
        normal: directPath,
        bold: directPath,
        italics: directPath,
        bolditalics: directPath,
      },
    });
    fontName = 'SimHei';
    fontInited = true;
    return;
  } catch {
    throw new Error('No usable Chinese font found in assets/fonts/');
  }
}

// ── Security policies ─────────────────────────────────────────────────
pdfmake.setLocalAccessPolicy(() => true);
pdfmake.setUrlAccessPolicy(() => false);

// ── Markdown → pdfmake content mapping ───────────────────────────────

interface PdfText {
  text: string | PdfText[];
  fontSize?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
  background?: string;
  decoration?: string;
  link?: string;
  lineHeight?: number;
  marginBottom?: number;
  marginTop?: number;
  marginLeft?: number;
  marginRight?: number;
  padding?: number;
  alignment?: string;
  font?: string;
}

function inlineTokensToContent(tokens: Record<string, unknown>[]): PdfText[] {
  const result: PdfText[] = [];
  for (const t of tokens) {
    if (t.type === 'text') {
      result.push({ text: t.text as string, fontSize: 11 });
    } else if (t.type === 'strong') {
      result.push({ text: t.text as string, bold: true, fontSize: 11 });
    } else if (t.type === 'em') {
      result.push({ text: t.text as string, italics: true, fontSize: 11 });
    } else if (t.type === 'codespan') {
      result.push({ text: t.text as string, fontSize: 10, background: '#f0f0f0', font: 'Courier' });
    } else if (t.type === 'link') {
      result.push({ text: t.text as string, fontSize: 11, color: '#1a73e8', decoration: 'underline', link: t.href as string });
    } else if (t.type === 'image') {
      result.push({ text: `[Image: ${t.href}]`, fontSize: 10, italics: true, color: '#999' });
    } else if (t.type === 'br') {
      result.push({ text: '\n', fontSize: 11 });
    } else if (t.type === 'del') {
      result.push({ text: t.text as string, fontSize: 11, decoration: 'lineThrough', color: '#999' });
    } else if ('text' in t && typeof t.text === 'string') {
      result.push({ text: t.text, fontSize: 11 });
    }
  }
  return result;
}

function tokensToContent(tokens: Record<string, unknown>[]): Record<string, unknown>[] {
  const content: Record<string, unknown>[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const sizes: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 12, 6: 11 };
        content.push({
          text: token.text,
          fontSize: sizes[token.depth as number] || 11,
          bold: true,
          marginBottom: 12 - (token.depth as number) * 2,
          marginTop: (token.depth as number) <= 2 ? 16 : 8,
        });
        break;
      }
      case 'paragraph': {
        const children = token.tokens ? inlineTokensToContent(token.tokens as Record<string, unknown>[]) : [];
        content.push({
          text: children.length > 0 ? children : token.text,
          fontSize: 11,
          lineHeight: 1.5,
          marginBottom: 4,
        });
        break;
      }
      case 'code': {
        content.push({
          text: token.text as string,
          fontSize: 9,
          font: 'Courier',
          background: '#f5f5f5',
          marginBottom: 8,
          marginLeft: 8,
          marginRight: 8,
          padding: 8,
        });
        break;
      }
      case 'list': {
        const items = (token.items as Record<string, unknown>[]).map(
          (item: Record<string, unknown>) => ({
            text: item.tokens
              ? inlineTokensToContent(item.tokens as Record<string, unknown>[])
              : (item.text as string),
            fontSize: 11,
            lineHeight: 1.4,
          }),
        );
        if (token.ordered) {
          content.push({ ol: items, marginBottom: 8 });
        } else {
          content.push({ ul: items, marginBottom: 8 });
        }
        break;
      }
      case 'table': {
        const header = (token.header as Record<string, unknown>[]).map(
          (cell: Record<string, unknown>) => ({ text: cell.text as string, bold: true, fontSize: 10 }),
        );
        const rows = (token.rows as Record<string, unknown>[][]).map(
          (row: Record<string, unknown>[]) =>
            row.map((cell: Record<string, unknown>) => ({ text: cell.text as string, fontSize: 10 })),
        );
        content.push({ table: { headerRows: 1, body: [header, ...rows] }, marginBottom: 8 });
        break;
      }
      case 'hr': {
        content.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#ccc' }],
          marginBottom: 12,
          marginTop: 8,
        });
        break;
      }
      case 'blockquote': {
        content.push({
          text: token.text as string,
          fontSize: 10,
          italics: true,
          marginLeft: 16,
          marginBottom: 8,
          color: '#555',
        });
        break;
      }
      case 'space':
        break;
      default: {
        if ('text' in token && typeof token.text === 'string' && (token.text as string).trim()) {
          content.push({ text: token.text, fontSize: 11, marginBottom: 4 });
        }
      }
    }
  }
  return content;
}

// ── Public API ────────────────────────────────────────────────────────

export async function generatePdf(markdown: string, title?: string): Promise<Buffer> {
  initFont();

  const tokens = marked.lexer(markdown) as Record<string, unknown>[];
  const bodyContent = tokensToContent(tokens);

  const docDefinition: Record<string, unknown> = {
    pageSize: 'A4',
    pageMargins: [60, 60, 60, 60],
    defaultStyle: {
      font: fontName,
      fontSize: 11,
      lineHeight: 1.5,
    },
    content: [
      ...(title
        ? [
            {
              text: title,
              fontSize: 28,
              bold: true,
              marginBottom: 24,
              alignment: 'center',
            },
          ]
        : []),
      ...bodyContent,
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 9,
      color: '#999',
      marginTop: 8,
    }),
  };

  const doc = pdfmake.createPdf(docDefinition);
  return doc.getBuffer() as Promise<Buffer>;
}
