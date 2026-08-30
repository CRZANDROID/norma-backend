const HREF_RE = /href\s*=\s*(["'])(.*?)\1/gi;
const FRAME_SRC_RE = /<(?:frame|iframe)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;

const SKIP_RE =
  /^(mailto:|tel:|javascript:|data:)/i;

const SKIP_HOST_OR_PATH =
  /facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|whatsapp|vimeo\.com|twitch\.tv|transparencia|infomex|plataformadetransparencia|\.jpg(?:$|\?)|\.jpeg(?:$|\?)|\.png(?:$|\?)|\.gif(?:$|\?)|\.webp(?:$|\?)|\.svg(?:$|\?)|\.css(?:$|\?)|\.js(?:$|\?)|\.woff|\.mp4|\.m3u8|\.webm|login|captcha|intranet|wp-admin|wp-login|xmlrpc|\.rss(?:$|\?)|\/feed(?:$|\/|\?)|transmisi[oó]n[-_]?en[-_]?vivo|en[-_]?vivo|livestream|live-stream|\/live(?:$|\/|\?)/i;

const PREFER_RE =
  /gaceta|iniciativa|decreto|dictamen|parlamentari|nota_detalle|nota_to_doc|nota_to_imagen|\.pdf(?:$|\?)|\/download|filename=|leyes|ley-|sesion|sesión|debate|infolej|trabajo.?legislativ|acuerdo|minuta|diario|orden.?del.?dia|boletin|boletín|comision|comisión|dictamenes|dictámenes/i;

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

export function normalizeCrawlUrl(baseUrl: string, href: string): string | null {
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
  if (!sameSite(baseUrl, resolved.href)) {
    return null;
  }
  if (SKIP_HOST_OR_PATH.test(resolved.href)) {
    return null;
  }
  return resolved.href;
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
  const haystack = `${url} ${extraHints.join(' ')}`;
  let score = 0;
  if (PREFER_RE.test(haystack)) {
    score += 10;
  }
  if (/\.pdf(?:$|\?)/i.test(url)) {
    score += 8;
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
