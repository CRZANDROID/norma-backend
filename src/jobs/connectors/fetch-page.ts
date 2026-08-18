import { CrawlError } from '../types';

export type FetchedPage = {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  body: Buffer;
  fetchedAt: string;
};

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_BYTES = 2_500_000;
const USER_AGENT =
  'NORMA-piloto/0.6 (monitoreo regulatorio; crawl de catálogo oficial)';

function classifyHttp(status: number): CrawlError {
  if (status === 429) {
    return new CrawlError(
      `HTTP ${status} (rate limit)`,
      'RATE_LIMIT',
      true,
    );
  }
  if (status === 401 || status === 403) {
    return new CrawlError(`HTTP ${status} (auth)`, 'AUTH', false);
  }
  if (status >= 500) {
    return new CrawlError(`HTTP ${status}`, 'NETWORK', true);
  }
  if (status >= 400) {
    return new CrawlError(`HTTP ${status}`, 'PARSE', false);
  }
  return new CrawlError(`HTTP ${status}`, 'UNKNOWN', true);
}

export async function fetchPage(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchedPage> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchedAt = new Date().toISOString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
        'User-Agent': USER_AGENT,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CrawlError(`Fallo de red: ${message}`, 'NETWORK', true);
  }

  if (!response.ok) {
    throw classifyHttp(response.status);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new CrawlError(
      `Respuesta demasiado grande (${arrayBuffer.byteLength} bytes)`,
      'PARSE',
      false,
    );
  }

  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';

  return {
    url,
    finalUrl: response.url || url,
    statusCode: response.status,
    contentType,
    body: Buffer.from(arrayBuffer),
    fetchedAt,
  };
}

export function pageFilename(contentType: string): string {
  if (contentType.includes('pdf')) {
    return 'page.pdf';
  }
  if (contentType.includes('json')) {
    return 'page.json';
  }
  if (contentType.includes('xml')) {
    return 'page.xml';
  }
  return 'page.html';
}
