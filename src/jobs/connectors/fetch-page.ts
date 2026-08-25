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
/** Tope por defecto: homes de congresos estatales a veces pasan de 2–3 MB. */
export const DEFAULT_MAX_BYTES = 10_000_000;
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

export function resolveMaxBytes(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.CRAWL_MAX_BYTES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_MAX_BYTES;
}

function tooLargeError(bytes: number, maxBytes: number): CrawlError {
  return new CrawlError(
    `Respuesta demasiado grande (${bytes} bytes; máximo ${maxBytes})`,
    'PARSE',
    false,
  );
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw tooLargeError(declared, maxBytes);
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw tooLargeError(arrayBuffer.byteLength, maxBytes);
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.byteLength) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLargeError(total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

export async function fetchPage(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchedPage> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = resolveMaxBytes(options.maxBytes);
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

  const body = await readBodyWithLimit(response, maxBytes);

  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';

  return {
    url,
    finalUrl: response.url || url,
    statusCode: response.status,
    contentType,
    body,
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
