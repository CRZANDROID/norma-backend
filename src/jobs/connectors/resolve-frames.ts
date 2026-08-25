import {
  collapseWhitespace,
  extractVisibleHtmlText,
  MIN_EXTRACTED_CHARS,
} from '../document-text';
import type { FetchedPage } from './fetch-page';

const MAX_FRAME_DEPTH = 2;
const MAX_FRAMES_PER_PAGE = 6;

const FRAME_SRC_RE =
  /<(?:frame|iframe)\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export function htmlBodyAsText(body: Buffer): string {
  return body.toString('latin1');
}

export function visibleTextLength(html: string): number {
  return collapseWhitespace(extractVisibleHtmlText(html)).length;
}

export function shouldFollowFrames(html: string): boolean {
  if (/<frameset\b/i.test(html) || /<frame\b/i.test(html)) {
    return true;
  }
  if (!/<iframe\b/i.test(html)) {
    return false;
  }
  return visibleTextLength(html) < MIN_EXTRACTED_CHARS;
}

export function resolveSameOriginUrl(
  src: string,
  baseUrl: string,
): string | null {
  const trimmed = src.trim();
  if (!trimmed || /^(javascript|data|about|mailto|blob):/i.test(trimmed)) {
    return null;
  }
  try {
    const base = new URL(baseUrl);
    const next = new URL(trimmed, base);
    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      return null;
    }
    if (next.hostname.toLowerCase() !== base.hostname.toLowerCase()) {
      return null;
    }
    return next.href;
  } catch {
    return null;
  }
}

export function listFrameUrls(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(FRAME_SRC_RE.source, FRAME_SRC_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    const resolved = resolveSameOriginUrl(raw, baseUrl);
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    found.push(resolved);
  }
  return found;
}

export function pickRichestPage(pages: FetchedPage[]): FetchedPage {
  let best = pages[0];
  let bestLen = visibleTextLength(htmlBodyAsText(best.body));
  for (let i = 1; i < pages.length; i += 1) {
    const len = visibleTextLength(htmlBodyAsText(pages[i].body));
    if (len > bestLen) {
      best = pages[i];
      bestLen = len;
    }
  }
  return best;
}

function isHtmlPage(page: FetchedPage): boolean {
  const type = page.contentType.toLowerCase();
  if (type.includes('html') || type.includes('xhtml')) {
    return true;
  }
  const sniff = htmlBodyAsText(page.body).slice(0, 512);
  return /<(?:html|frameset|frame|iframe)\b/i.test(sniff);
}

export async function followContentFrames(
  page: FetchedPage,
  fetchChild: (url: string, referer: string) => Promise<FetchedPage>,
  depth = 0,
): Promise<FetchedPage> {
  if (depth >= MAX_FRAME_DEPTH || !isHtmlPage(page)) {
    return page;
  }

  const html = htmlBodyAsText(page.body);
  if (!shouldFollowFrames(html)) {
    return page;
  }

  const frameUrls = listFrameUrls(html, page.finalUrl).slice(
    0,
    MAX_FRAMES_PER_PAGE,
  );
  if (frameUrls.length === 0) {
    return page;
  }

  const children: FetchedPage[] = [];
  for (const frameUrl of frameUrls) {
    try {
      const child = await fetchChild(frameUrl, page.finalUrl);
      children.push(await followContentFrames(child, fetchChild, depth + 1));
    } catch {
      // Un frame roto no tumba el crawl: se evalúa el resto.
    }
  }

  if (children.length === 0) {
    return page;
  }

  const richest = pickRichestPage([page, ...children]);
  return {
    ...richest,
    url: page.url,
  };
}
