import * as http from 'node:http';
import * as https from 'node:https';
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
const MAX_REDIRECTS = 8;

export function networkErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const cause = (err as Error & { cause?: unknown }).cause;
  const extra =
    cause instanceof Error
      ? (cause as NodeJS.ErrnoException).code || cause.message
      : cause && typeof cause === 'object' && 'code' in cause
        ? String((cause as { code: string }).code)
        : '';
  if (extra && extra !== err.message) {
    return `${err.message} (${extra})`;
  }
  return err.message;
}

export function isTlsCertificateError(err: unknown): boolean {
  return /UNABLE_TO_VERIFY|CERT_|unable to verify the first certificate|self[- ]signed|unable to get local issuer/i.test(
    networkErrorMessage(err),
  );
}

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

function collectNodeBody(
  stream: http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.destroy();
        reject(tooLargeError(total, maxBytes));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks, total)));
    stream.on('error', reject);
  });
}

/** Fallback cuando el origen .gob.mx publica HTTPS sin cadena intermedia. */
async function fetchPageRelaxedTls(
  url: string,
  options: {
    timeoutMs: number;
    maxBytes: number;
    headers: Record<string, string>;
    fetchedAt: string;
  },
  hops = 0,
): Promise<FetchedPage> {
  if (hops > MAX_REDIRECTS) {
    throw new CrawlError('Demasiados redirects', 'NETWORK', true);
  }

  const parsed = new URL(url);
  const lib = parsed.protocol === 'http:' ? http : https;
  const requestOptions: https.RequestOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    path: `${parsed.pathname}${parsed.search}`,
    method: 'GET',
    headers: options.headers,
    timeout: options.timeoutMs,
    rejectUnauthorized: false,
    servername: parsed.hostname,
  };

  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = lib.request(requestOptions, resolve);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${options.timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });

  const statusCode = response.statusCode ?? 0;
  const location = response.headers.location;
  if (statusCode >= 300 && statusCode < 400 && location) {
    response.resume();
    const next = new URL(location, url).href;
    return fetchPageRelaxedTls(next, options, hops + 1);
  }

  if (statusCode < 200 || statusCode >= 300) {
    response.resume();
    throw classifyHttp(statusCode);
  }

  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    response.resume();
    throw tooLargeError(declared, options.maxBytes);
  }

  const body = await collectNodeBody(response, options.maxBytes);
  const contentType =
    String(response.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim() || 'application/octet-stream';

  return {
    url,
    finalUrl: url,
    statusCode,
    contentType,
    body,
    fetchedAt: options.fetchedAt,
  };
}

export async function fetchPage(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number; referer?: string } = {},
): Promise<FetchedPage> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = resolveMaxBytes(options.maxBytes);
  const fetchedAt = new Date().toISOString();

  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
    'User-Agent': USER_AGENT,
  };
  if (options.referer) {
    headers.Referer = options.referer;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });

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
  } catch (err) {
    if (err instanceof CrawlError) {
      throw err;
    }
    if (!isTlsCertificateError(err)) {
      throw new CrawlError(
        `Fallo de red: ${networkErrorMessage(err)}`,
        'NETWORK',
        true,
      );
    }
    const page = await fetchPageRelaxedTls(url, {
      timeoutMs,
      maxBytes,
      headers,
      fetchedAt,
    });
    return { ...page, url };
  }
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
