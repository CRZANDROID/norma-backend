const HREF_RE = /href\s*=\s*(["'])(.*?)\1/gi;
const FRAME_SRC_RE = /<(?:frame|iframe)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;

const SKIP_RE =
  /^(mailto:|tel:|javascript:|data:)/i;

const SKIP_HOST_OR_PATH =
  /facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|whatsapp|vimeo\.com|twitch\.tv|transparencia|infomex|plataformadetransparencia|\.jpg(?:$|\?)|\.jpeg(?:$|\?)|\.png(?:$|\?)|\.gif(?:$|\?)|\.webp(?:$|\?)|\.svg(?:$|\?)|\.css(?:$|\?)|\.js(?:$|\?)|\.woff|\.mp4|\.m3u8|\.webm|login|captcha|intranet|wp-admin|wp-login|xmlrpc|\.rss(?:$|\?)|\/feed(?:$|\/|\?)|transmisi[oó]n[-_]?en[-_]?vivo|en[-_]?vivo|livestream|live-stream|\/live(?:$|\/|\?)|inventario[-_]?bienes|bienes[-_]?muebles|coord[-_]?archivo|coordenaci[oó]n[-_]?archivo|cuadro[-_].*clasificacion|\/cadido\//i;

const PREFER_RE =
  /gaceta|iniciativa|decreto|dictamen|parlamentari|nota_detalle|nota_to_doc|nota_to_imagen|\/download|filename=|leyes|ley-|sesion|sesión|debate|infolej|trabajo.?legislativ|acuerdo|minuta|diario|orden.?del.?dia|boletin|boletín|comision|comisión|dictamenes|dictámenes/i;

export function bareHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

export function sameSite(baseUrl: string, candidateUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl);
    if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
      return false;
    }
    return bareHost(base.hostname) === bareHost(candidate.hostname);
  } catch {
    return false;
  }
}

/** `congresochiapas.gob.mx` desde `www.` o `web.congresochiapas.gob.mx`. */
export function gobMxRegistrable(hostname: string): string | null {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  const parts = host.split('.');
  if (parts.length < 3) {
    return null;
  }
  if (parts[parts.length - 2] !== 'gob' || parts[parts.length - 1] !== 'mx') {
    return null;
  }
  return parts.slice(-3).join('.');
}

export function sameCongressFamily(
  baseUrl: string,
  candidateUrl: string,
): boolean {
  if (sameSite(baseUrl, candidateUrl)) {
    return true;
  }
  try {
    const base = gobMxRegistrable(new URL(baseUrl).hostname);
    const candidate = gobMxRegistrable(new URL(candidateUrl).hostname);
    return Boolean(base && candidate && base === candidate);
  } catch {
    return false;
  }
}

export function normalizeCrawlUrl(
  baseUrl: string,
  href: string,
  options: { congressFamily?: boolean } = {},
): string | null {
  const trimmed = href.trim();
  if (!trimmed || SKIP_RE.test(trimmed) || trimmed.startsWith('#')) {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  resolved.hash = '';
  const allowed = options.congressFamily
    ? sameCongressFamily(baseUrl, resolved.href)
    : sameSite(baseUrl, resolved.href);
  if (!allowed) {
    return null;
  }
  if (SKIP_HOST_OR_PATH.test(resolved.href)) {
    return null;
  }
  return resolved.href;
}

const META_REFRESH_ATTR = [
  /http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']([^"']+)/i,
  /content\s*=\s*["']([^"']+)["'][^>]*http-equiv\s*=\s*["']refresh["']/i,
];

/**
 * Portada-trampolín: HTML corto con meta refresh.
 * Mismo host (Coahuila `/coahuila/`) o subdominio del mismo *.gob.mx (Chiapas `web.`).
 * El spider de links sigue siendo solo mismo host.
 */
export function metaRefreshStubTarget(
  html: string,
  baseUrl: string,
): string | null {
  if (!html || html.length > 4096) {
    return null;
  }
  let content: string | undefined;
  for (const re of META_REFRESH_ATTR) {
    re.lastIndex = 0;
    const match = re.exec(html);
    if (match?.[1]) {
      content = match[1];
      break;
    }
  }
  if (!content) {
    return null;
  }
  const urlMatch = /url\s*=\s*([^\s;]+)/i.exec(content);
  if (!urlMatch?.[1]) {
    return null;
  }
  const raw = urlMatch[1].replace(/^['"]|['"]$/g, '').trim();
  const target = normalizeCrawlUrl(baseUrl, raw, { congressFamily: true });
  if (!target || target === baseUrl) {
    return null;
  }
  const hrefs = html.match(/href\s*=/gi)?.length ?? 0;
  if (hrefs >= 3) {
    return null;
  }
  return target;
}

/** Player de sesión en vivo / streaming — no es documento de catálogo. */
const LIVE_MEDIA_RE =
  /youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|\.mp4(?:$|\?)|\.m3u8|\.webm|transmisi[oó]n[-_]?en[-_]?vivo|en[-_]?vivo|livestream|live-stream|\/live(?:$|\/|\?)/i;

export function isLiveMediaUrl(url: string): boolean {
  return LIVE_MEDIA_RE.test(url);
}

export function extractHrefs(html: string): string[] {
  const found: string[] = [];
  for (const re of [HREF_RE, FRAME_SRC_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      found.push(match[2]);
    }
  }
  return found;
}

export function linkScore(url: string, extraHints: string[] = []): number {
  let score = 0;
  const legislative = PREFER_RE.test(url);
  if (legislative) {
    score += 10;
  }
  if (/\.pdf(?:$|\?)/i.test(url)) {
    score += legislative ? 8 : 1;
  }
  if (/nota_detalle/i.test(url)) {
    score += 12;
  }
  for (const hint of extraHints) {
    const token = hint.trim().toLowerCase();
    if (token.length >= 4 && url.toLowerCase().includes(token)) {
      score += 3;
    }
  }
  return score;
}

export function discoverLinks(
  html: string,
  pageUrl: string,
  extraHints: string[] = [],
): string[] {
  const unique = new Set<string>();
  for (const href of extractHrefs(html)) {
    const url = normalizeCrawlUrl(pageUrl, href);
    if (url) {
      unique.add(url);
    }
  }
  return [...unique].sort(
    (a, b) => linkScore(b, extraHints) - linkScore(a, extraHints),
  );
}

export function sectionHints(sections: unknown): string[] {
  if (!Array.isArray(sections)) {
    return [];
  }
  const hints: string[] = [];
  for (const row of sections) {
    if (Array.isArray(row)) {
      for (const cell of row) {
        if (typeof cell === 'string' && cell.trim()) {
          hints.push(cell.trim());
        }
      }
    } else if (typeof row === 'string' && row.trim()) {
      hints.push(row.trim());
    }
  }
  return hints;
}
