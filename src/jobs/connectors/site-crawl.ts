import { createHash } from 'node:crypto';
import { CrawlError } from '../types';
import { urlLooksLikePdf, urlLooksLikeWord } from '../document-text';
import { fetchPage, pageFilename, sniffCrawlExtension, type FetchedPage } from './fetch-page';
import { discoverLinks, metaRefreshStubTarget, sectionHints } from './discover-links';
import type { ConnectorFetch, ConnectorSource } from './types';

const DEFAULT_MAX_PAGES = 80;
const ABSOLUTE_MAX_PAGES = 80;
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_DELAY_MS = 150;

export function resolveMaxPages(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.min(Math.floor(override), ABSOLUTE_MAX_PAGES);
  }
  const fromEnv = Number(process.env.CRAWL_MAX_PAGES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(Math.floor(fromEnv), ABSOLUTE_MAX_PAGES);
  }
  return DEFAULT_MAX_PAGES;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function filenameFor(page: FetchedPage, index: number): string {
  const hash = createHash('sha256').update(page.finalUrl).digest('hex').slice(0, 10);
  const ext = pageFilename(page.contentType, {
    url: page.finalUrl,
    body: page.body,
  })
    .split('.')
    .pop() || 'html';
  return `doc-${String(index).padStart(2, '0')}-${hash}.${ext}`;
}

export type SiteCrawlDeps = {
  fetch?: typeof fetchPage;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
};

export async function crawlSite(
  source: ConnectorSource,
  deps: SiteCrawlDeps = {},
): Promise<ConnectorFetch[]> {
  const startUrl = source.url?.trim();
  if (!startUrl) {
    throw new CrawlError(
      `La fuente ${source.code} no tiene URL`,
      'PARSE',
      false,
    );
  }

  const fetchFn = deps.fetch ?? fetchPage;
  const maxPages = resolveMaxPages(deps.maxPages);
  const maxDepth = deps.maxDepth ?? DEFAULT_MAX_DEPTH;
  const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
  const hints = [
    ...sectionHints(source.sections),
    ...(source.searchFocus ?? []),
    ...(source.keywordsGuide ?? []),
  ];

  const queued = new Set<string>([startUrl]);
  const queue: Array<{ url: string; depth: number }> = [
    { url: startUrl, depth: 0 },
  ];
  const seenFinal = new Set<string>();
  const pages: ConnectorFetch[] = [];
  const maxQueue = maxPages * 3;

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift();
    if (!next) {
      break;
    }

    let page: FetchedPage;
    try {
      page = await fetchFn(next.url);
    } catch (err) {
      if (pages.length === 0) {
        throw err;
      }
      continue;
    }

    if (!page.body?.length) {
      if (pages.length === 0) {
        throw new CrawlError(
          `La portada de ${source.code} llegó vacía`,
          'PARSE',
          true,
        );
      }
      continue;
    }

    const finalUrl = page.finalUrl || next.url;
    const sniffed = sniffCrawlExtension({
      contentType: page.contentType,
      url: finalUrl,
      body: page.body,
    });
    if (sniffed === 'html') {
      const bounce = metaRefreshStubTarget(page.body.toString('utf8'), finalUrl);
      if (bounce) {
        seenFinal.add(finalUrl);
        if (!queued.has(bounce)) {
          queued.add(bounce);
          queue.unshift({ url: bounce, depth: next.depth });
        }
        continue;
      }
    }

    if (seenFinal.has(finalUrl)) {
      continue;
    }
    seenFinal.add(finalUrl);

    pages.push({
      page,
      filename: filenameFor(page, pages.length),
    });

    const isHtml = sniffed === 'html';
    if (isHtml && next.depth < maxDepth) {
      const discovered = discoverLinks(
        page.body.toString('utf8'),
        finalUrl,
        hints,
      );
      const binaries: Array<{ url: string; depth: number }> = [];
      const html: Array<{ url: string; depth: number }> = [];
      for (const url of discovered) {
        if (queued.has(url)) {
          continue;
        }
        const binary = urlLooksLikePdf(url) || urlLooksLikeWord(url);
        if (!binary && queued.size >= maxQueue) {
          continue;
        }
        queued.add(url);
        const item = { url, depth: next.depth + 1 };
        if (binary) {
          binaries.push(item);
        } else {
          html.push(item);
        }
      }
      queue.unshift(...binaries);
      queue.push(...html);
    }

    if (queue.length > 0 && pages.length < maxPages) {
      await sleep(delayMs);
    }
  }

  if (pages.length === 0) {
    throw new CrawlError(
      `No se pudo leer ninguna página de ${source.code}`,
      'NETWORK',
      true,
    );
  }

  return pages;
}
