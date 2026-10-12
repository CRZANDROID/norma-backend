export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchOutcome = {
  configured: boolean;
  results: WebSearchHit[];
};

const SEARCH_URL = 'https://html.duckduckgo.com/html/';
const RESULT_CAP = 8;
const HTML_CAP = 500_000;
const SEARCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function isPublicWebSearchConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = (env.WEB_SEARCH_ENABLED ?? '').trim().toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'off';
}

export function parseDuckDuckGoResults(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const anchorRe = /<a\b(?=[^>]*\bresult__a\b)[^>]*>[\s\S]*?<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) && hits.length < RESULT_CAP) {
    const tag = match[0];
    const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
    const inner = /^<a\b[^>]*>([\s\S]*)<\/a>$/i.exec(tag)?.[1] ?? '';
    if (!href) continue;
    const url = resolveResultUrl(decodeHtml(href));
    const title = visible(inner).slice(0, 200);
    if (!url || !title) continue;
    const after = html.slice(match.index, match.index + 2500);
    const snippetTag =
      /<(?:a|td|span)\b(?=[^>]*\bresult__snippet\b)[^>]*>([\s\S]*?)<\/(?:a|td|span)>/i.exec(
        after,
      );
    hits.push({
      title,
      url,
      snippet: snippetTag ? visible(snippetTag[1]).slice(0, 400) : '',
    });
  }
  return hits;
}

export async function searchPublicWeb(
  companyName: string,
  description?: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
): Promise<WebSearchOutcome> {
  const env = options.env ?? process.env;
  if (!isPublicWebSearchConfigured(env)) {
    return { configured: false, results: [] };
  }
  const query = [companyName.trim(), description?.trim() ?? '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);
  if (!query) return { configured: true, results: [] };

  const fetchImpl = options.fetchImpl ?? fetch;
  const target = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchImpl(target, {
      signal: AbortSignal.timeout(options.timeoutMs ?? SEARCH_TIMEOUT_MS),
      headers: {
        Accept: 'text/html',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
    });
    if (!response.ok) return { configured: true, results: [] };
    const html = (await response.text()).slice(0, HTML_CAP);
    return { configured: true, results: parseDuckDuckGoResults(html) };
  } catch {
    return { configured: true, results: [] };
  }
}

export function evidenceFromHits(hits: WebSearchHit[]): string {
  return hits
    .map(
      (hit, index) =>
        `${index + 1}. ${hit.title}\nURL: ${hit.url}\nFragmento: ${hit.snippet}`,
    )
    .join('\n\n');
}

function resolveResultUrl(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(
      trimmed.startsWith('//') ? `https:${trimmed}` : trimmed,
      'https://duckduckgo.com',
    );
    const uddg = parsed.searchParams.get('uddg');
    const target = uddg ? new URL(uddg) : parsed;
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      return null;
    if (!uddg && /(^|\.)duckduckgo\.com$/i.test(target.hostname)) return null;
    return target.toString();
  } catch {
    return null;
  }
}

function visible(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}
