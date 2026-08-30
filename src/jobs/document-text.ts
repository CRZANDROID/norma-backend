import { createHash } from 'node:crypto';

/** Texto visible mínimo para no encolar normalize (HTML vacío / captcha / stub). */
export const MIN_EXTRACTED_CHARS = 80;

const NOISE_TAGS = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'iframe',
  'svg',
  'template',
];

const CAPTCHA_RE =
  /captcha|hcaptcha|recaptcha|cf-challenge|cf-browser-verification|attention required|just a moment|enable javascript and cookies|ddos protection by|checking your browser/i;

export function isMetaCrawlFilename(filename: string): boolean {
  const name = filename.toLowerCase();
  return name === 'meta.json' || name.endsWith('.json');
}

export function looksLikePdfBuffer(buffer?: Buffer | null): boolean {
  if (!buffer?.length) {
    return false;
  }
  const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  return head.includes('%PDF');
}

/** Path or query like `/Home/Download?filename=convocatoria.pdf`. */
export function urlLooksLikePdf(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (/\.pdf$/i.test(parsed.pathname)) {
      return true;
    }
    for (const value of parsed.searchParams.values()) {
      if (/\.pdf$/i.test(value)) {
        return true;
      }
    }
  } catch {
    return /\.pdf(?:$|\?|&)/i.test(url);
  }
  return false;
}

export function looksLikeOleDocBuffer(buffer?: Buffer | null): boolean {
  if (!buffer || buffer.length < 8) {
    return false;
  }
  return (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

export function looksLikeDocxBuffer(buffer?: Buffer | null): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }
  const zip =
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
  if (!zip) {
    return false;
  }
  const hay = buffer
    .subarray(0, Math.min(buffer.length, 65_536))
    .toString('latin1');
  return hay.includes('word/document') || hay.includes('wordprocessingml');
}

/** Path, query, or DOF `nota_to_doc.php`. */
export function urlLooksLikeWord(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  if (/nota_to_doc\.php/i.test(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (/\.docx?$/i.test(parsed.pathname)) {
      return true;
    }
    for (const value of parsed.searchParams.values()) {
      if (/\.docx?$/i.test(value)) {
        return true;
      }
    }
  } catch {
    return /\.docx?(?:$|\?|&)/i.test(url);
  }
  return false;
}

export type PdfSniffHints = {
  url?: string | null;
  buffer?: Buffer | null;
};

export function isExtractableCrawlFile(
  filename: string,
  mimeType?: string | null,
  hints: PdfSniffHints = {},
): boolean {
  if (isMetaCrawlFilename(filename)) {
    return false;
  }
  if (looksLikePdfBuffer(hints.buffer) || urlLooksLikePdf(hints.url)) {
    return true;
  }
  if (
    looksLikeOleDocBuffer(hints.buffer) ||
    looksLikeDocxBuffer(hints.buffer) ||
    urlLooksLikeWord(hints.url)
  ) {
    return true;
  }
  const name = filename.toLowerCase();
  if (
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    name.endsWith('.pdf') ||
    name.endsWith('.xml') ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) {
    return true;
  }
  const mime = (mimeType || '').toLowerCase();
  return (
    mime.includes('html') ||
    mime.includes('pdf') ||
    mime.includes('xml') ||
    mime.includes('msword') ||
    mime.includes('wordprocessingml') ||
    mime.includes('officedocument.word')
  );
}

export function isWordContent(
  filename: string,
  mimeType?: string | null,
  hints: PdfSniffHints = {},
): boolean {
  if (looksLikePdfBuffer(hints.buffer)) {
    return false;
  }
  if (looksLikeOleDocBuffer(hints.buffer) || looksLikeDocxBuffer(hints.buffer)) {
    return true;
  }
  if (urlLooksLikeWord(hints.url)) {
    return true;
  }
  const name = filename.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  return (
    name.endsWith('.doc') ||
    name.endsWith('.docx') ||
    mime.includes('msword') ||
    mime.includes('wordprocessingml') ||
    mime.includes('officedocument.word')
  );
}

export function isPdfContent(
  filename: string,
  mimeType?: string | null,
  hints: PdfSniffHints = {},
): boolean {
  if (looksLikePdfBuffer(hints.buffer)) {
    return true;
  }
  if (urlLooksLikePdf(hints.url)) {
    return true;
  }
  const name = filename.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  return name.endsWith('.pdf') || mime.includes('pdf');
}

/** Wrapper without article/main — content lives in frames we already enqueue. */
export function isFramesetShell(html: string): boolean {
  return (
    /<frameset\b/i.test(html) &&
    !/<article\b|<main\b|<p\b/i.test(html)
  );
}

export function looksLikeCaptcha(raw: string): boolean {
  return CAPTCHA_RE.test(raw);
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function sha256Normalized(text: string): string {
  return createHash('sha256').update(collapseWhitespace(text), 'utf8').digest('hex');
}

export function derivedExtractedPath(documentId: string): string {
  return `derived/${documentId}/extracted.txt`;
}

export function derivedNormalizedPath(documentId: string): string {
  return `derived/${documentId}/normalized.json`;
}

export function extractVisibleHtmlText(html: string): string {
  let s = html;
  for (const tag of NOISE_TAGS) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
    s = s.replace(re, ' ');
  }
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(
    /<\/(p|div|h[1-6]|li|tr|blockquote|section|article|td|th)>/gi,
    '\n',
  );
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeBasicEntities(s);
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

export type ExtractFailureReason =
  | 'empty'
  | 'captcha'
  | 'too-short'
  | 'unsupported';

export function validateExtractedText(
  _rawBytesAsText: string,
  extracted: string,
  options: { kind?: 'html' | 'pdf' | 'xml' | 'doc' } = {},
): { ok: true } | { ok: false; reason: ExtractFailureReason; message: string } {
  const kind = options.kind ?? 'html';
  // Solo texto visible: el HTML crudo de Avada/CF7 incluye .grecaptcha-badge y
  // .wpcf7-captchar en CSS sin que la página sea un desafío.
  if (kind === 'html' && looksLikeCaptcha(extracted)) {
    return {
      ok: false,
      reason: 'captcha',
      message:
        'La página parece un captcha o intersticial; no hay texto documental extraíble.',
    };
  }
  const collapsed = collapseWhitespace(extracted);
  if (!collapsed) {
    return {
      ok: false,
      reason: 'empty',
      message:
        kind === 'pdf'
          ? 'PDF escaneado: es una imagen y no tiene capa de texto. El archivo sí se guardó; OCR no está en este sprint.'
          : kind === 'xml'
            ? 'XML vacío o sin texto visible.'
            : kind === 'doc'
              ? 'Word vacío o sin texto extraíble.'
              : 'HTML vacío o sin texto visible (script/style/nav omitidos).',
    };
  }
  if (collapsed.length < MIN_EXTRACTED_CHARS) {
    return {
      ok: false,
      reason: 'too-short',
      message: `Texto extraído por debajo del umbral (${collapsed.length} < ${MIN_EXTRACTED_CHARS} caracteres).`,
    };
  }
  return { ok: true };
}

export type NormalizedDocumentFicha = {
  sourceCode: string | null;
  sourceId: string | null;
  url: string | null;
  fetchedAt: string | null;
  mimeType: string | null;
  text: string;
  jobRunId: string | null;
  contentHash: string;
};

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  if (Array.isArray(text)) {
    return text.join('\n\n').trim();
  }
  return String(text ?? '').trim();
}

export async function extractWordText(buffer: Buffer): Promise<string> {
  if (looksLikeDocxBuffer(buffer) || !looksLikeOleDocBuffer(buffer)) {
    try {
      const mammoth = await import('mammoth');
      const extractRawText =
        mammoth.extractRawText ?? mammoth.default.extractRawText;
      const result = await extractRawText({ buffer });
      const text = String(result.value ?? '').trim();
      if (text) {
        return text;
      }
    } catch {
      // OLE .doc u OpenXML raro: probar word-extractor.
    }
  }
  const { default: WordExtractor } = await import('word-extractor');
  const extractor = new WordExtractor();
  const extracted = await extractor.extract(buffer);
  return [
    extracted.getBody(),
    extracted.getHeaders(),
    extracted.getFooters(),
  ]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n\n')
    .trim();
}
