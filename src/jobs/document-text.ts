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

export function isExtractableCrawlFile(
  filename: string,
  mimeType?: string | null,
): boolean {
  if (isMetaCrawlFilename(filename)) {
    return false;
  }
  const name = filename.toLowerCase();
  if (
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    name.endsWith('.pdf')
  ) {
    return true;
  }
  const mime = (mimeType || '').toLowerCase();
  return mime.includes('html') || mime.includes('pdf');
}

export function isPdfContent(
  filename: string,
  mimeType?: string | null,
): boolean {
  const name = filename.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  return name.endsWith('.pdf') || mime.includes('pdf');
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

/** Entidades HTML4 Latin-1 + puntuación frecuente en sitios .gob.mx. */
const HTML_NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  iexcl: '¡',
  cent: '¢',
  pound: '£',
  curren: '¤',
  yen: '¥',
  brvbar: '¦',
  sect: '§',
  uml: '¨',
  copy: '©',
  ordf: 'ª',
  laquo: '«',
  not: '¬',
  shy: '',
  reg: '®',
  macr: '¯',
  deg: '°',
  plusmn: '±',
  sup2: '²',
  sup3: '³',
  acute: '´',
  micro: 'µ',
  para: '¶',
  middot: '·',
  cedil: '¸',
  sup1: '¹',
  ordm: 'º',
  raquo: '»',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
  iquest: '¿',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Igrave: 'Ì',
  Iacute: 'Í',
  Icirc: 'Î',
  Iuml: 'Ï',
  ETH: 'Ð',
  Ntilde: 'Ñ',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  times: '×',
  Oslash: 'Ø',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  THORN: 'Þ',
  szlig: 'ß',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  eth: 'ð',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  divide: '÷',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  thorn: 'þ',
  yuml: 'ÿ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeBasicEntities(text: string): string {
  return text
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name: string) => {
      return HTML_NAMED_ENTITIES[name] ?? match;
    })
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
  rawBytesAsText: string,
  extracted: string,
): { ok: true } | { ok: false; reason: ExtractFailureReason; message: string } {
  if (looksLikeCaptcha(rawBytesAsText) || looksLikeCaptcha(extracted)) {
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
      message: 'HTML vacío o sin texto visible (script/style/nav omitidos).',
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
