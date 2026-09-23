import { createHash } from 'node:crypto';
import { CrawlError } from '../types';
import { ORIGIN_PAGE_UNAVAILABLE } from '../origin-page';
import { urlLooksLikePdf, urlLooksLikeWord } from '../document-text';
import { urlIsBeforeMinYear } from '../crawl-min-year';
import { fetchPage, pageFilename, sniffCrawlExtension, type FetchedPage } from './fetch-page';
import {
  discoverLinks,
  gobMxUrlInSourceScope,
  metaRefreshStubTarget,
  sectionHints,
  shouldSaveCrawledPage,
} from './discover-links';
import type {
  ConnectorCrawlDeps,
  ConnectorFetch,
  ConnectorSource,
  CrawlOutcome,
} from './types';

const DEFAULT_MAX_PAGES = 200;
const ABSOLUTE_MAX_PAGES = 2000;
const DEFAULT_MAX_DEPTH = 4;
const ABSOLUTE_MAX_DEPTH = 8;
const DEFAULT_DELAY_MS = 150;
const START_PAGE_TIMEOUT_MS = 25_000;
const INNER_PAGE_TIMEOUT_MS = 20_000;
/** Fallos de red/TLS seguidos: el origen está caído; no drenar el menú. */
export const ORIGIN_CIRCUIT_FAILURES = 6;

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

export function resolveMaxDepth(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return Math.min(Math.floor(override), ABSOLUTE_MAX_DEPTH);
  }
  const fromEnv = Number(process.env.CRAWL_MAX_DEPTH);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.min(Math.floor(fromEnv), ABSOLUTE_MAX_DEPTH);
  }
  return DEFAULT_MAX_DEPTH;
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

export type SiteCrawlDeps = ConnectorCrawlDeps & {
  fetch?: typeof fetchPage;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  circuitFailures?: number;
};

export async function crawlSite(
  source: ConnectorSource,
  deps: SiteCrawlDeps = {},
): Promise<CrawlOutcome> {
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
  const maxDepth = resolveMaxDepth(deps.maxDepth);
  const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
  const circuitLimit = deps.circuitFailures ?? ORIGIN_CIRCUIT_FAILURES;
  const maxFetchAttempts = maxPages * 5;
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
  const maxQueue = maxPages * 8;
  let failedFetches = 0;
  let consecutiveFailures = 0;
  let fetchAttempts = 0;
  let originUnreachable = false;

  while (
    queue.length > 0 &&
    pages.length < maxPages &&
    fetchAttempts < maxFetchAttempts &&
    !originUnreachable
  ) {
    const next = queue.shift();
    if (!next) {
      break;
    }
    if (
      next.depth > 0 &&
      (urlIsBeforeMinYear(next.url) || !gobMxUrlInSourceScope(startUrl, next.url))
    ) {
      continue;
    }

    fetchAttempts += 1;
    let page: FetchedPage;
    try {
      page = await fetchFn(next.url, {
        timeoutMs: next.depth === 0 ? START_PAGE_TIMEOUT_MS : INNER_PAGE_TIMEOUT_MS,
      });
      consecutiveFailures = 0;
    } catch (err) {
      if (pages.length === 0) {
        throw err;
      }
      failedFetches += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= circuitLimit) {
        originUnreachable = true;
      }
      continue;
    }

    if (!page.body?.length) {
      if (pages.length === 0) {
    throw new CrawlError(
      ORIGIN_PAGE_UNAVAILABLE,
      'PARSE',
      true,
    );
      }
      continue;
    }

    const finalUrl = page.finalUrl || next.url;
    if (
      next.depth > 0 &&
      (urlIsBeforeMinYear(finalUrl) || !gobMxUrlInSourceScope(startUrl, finalUrl))
    ) {
      continue;
    }
    const sniffed = sniffCrawlExtension({
      contentType: page.contentType,
      url: finalUrl,
      body: page.body,
    });
    if (sniffed === 'html') {
      const bounce = metaRefreshStubTarget(
        page.body.toString('utf8'),
        finalUrl,
        startUrl,
      );
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

    const binary =
      sniffed === 'pdf' ||
      sniffed === 'doc' ||
      sniffed === 'docx' ||
      urlLooksLikePdf(finalUrl) ||
      urlLooksLikeWord(finalUrl);
    const save = shouldSaveCrawledPage({
      url: finalUrl,
      depth: next.depth,
      binary,
      hints,
    });
    if (save) {
      pages.push({
        page,
        filename: filenameFor(page, pages.length),
      });
      deps.onProgress?.({
        saved: pages.length,
        maxPages,
        url: finalUrl,
      });
    }

    const isHtml = sniffed === 'html';
    if (isHtml && next.depth < maxDepth) {
      const discovered = discoverLinks(
        page.body.toString('utf8'),
        finalUrl,
        hints,
        startUrl,
      );
      const binaries: Array<{ url: string; depth: number }> = [];
      const html: Array<{ url: string; depth: number }> = [];
      for (const url of discovered) {
        if (queued.has(url) || queued.size >= maxQueue) {
          continue;
        }
        queued.add(url);
        const item = { url, depth: next.depth + 1 };
        if (urlLooksLikePdf(url) || urlLooksLikeWord(url)) {
          binaries.push(item);
        } else {
          html.push(item);
        }
      }
      queue.unshift(...binaries);
      queue.push(...html);
    }

    if (
      queue.length > 0 &&
      pages.length < maxPages &&
      fetchAttempts < maxFetchAttempts &&
      !originUnreachable
    ) {
      await sleep(delayMs);
    }
  }

  if (pages.length === 0) {
    throw new CrawlError(
      ORIGIN_PAGE_UNAVAILABLE,
      'NETWORK',
      true,
    );
  }

  return { pages, failedFetches, originUnreachable };
}
