// pdfmake v0.3.x exports a singleton instance (not a class).
// The module.exports = new pdfmake() pattern means the default import is the instance itself.
declare module 'pdfmake' {
  interface TFontDictionary {
    [fontName: string]: {
      normal?: string | Buffer;
      bold?: string | Buffer;
      italics?: string | Buffer;
      bolditalics?: string | Buffer;
    };
  }

  interface TDocumentDefinitions {
    pageSize?: string;
    pageMargins?: [number, number, number, number];
    defaultStyle?: {
      font?: string;
      fontSize?: number;
      lineHeight?: number;
    };
    content?: unknown[];
    footer?: (currentPage: number, pageCount: number) => { text: string; alignment: string; fontSize: number; color: string; marginTop: number };
    [key: string]: unknown;
  }

  interface TOutputDocument {
    getBuffer: () => Promise<Buffer>;
    getStream: () => Promise<import('stream').Readable>;
    getBase64: () => Promise<string>;
    getDataUrl: () => Promise<string>;
  }

  interface PdfmakeInstance {
    setFonts(fonts: TFontDictionary): void;
    addFonts(fonts: TFontDictionary): void;
    clearFonts(): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    createPdf(docDefinition: TDocumentDefinitions, options?: Record<string, unknown>): TOutputDocument;
    virtualfs: Record<string, unknown>;
  }

  const instance: PdfmakeInstance;
  export default instance;
}
