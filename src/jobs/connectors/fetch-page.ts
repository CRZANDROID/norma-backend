import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import { ORIGIN_PAGE_UNAVAILABLE } from '../origin-page';
import { CrawlError } from '../types';
import {
  looksLikeDocxBuffer,
  looksLikeOleDocBuffer,
  looksLikePdfBuffer,
  urlLooksLikePdf,
  urlLooksLikeWord,
} from '../document-text';

export type SniffedCrawlExt = 'pdf' | 'doc' | 'docx' | 'xml' | 'json' | 'html';

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
  'NORMA-piloto/0.7 (monitoreo regulatorio; crawl de catálogo oficial)';

const TLS_ERROR_RE =
  /certificate|unable to verify|UNABLE_TO_VERIFY|CERT_|ERR_TLS|self.signed|ssl|tls/i;
const MAX_REDIRECTS = 8;

function isTlsFailure(message: string): boolean {
  return TLS_ERROR_RE.test(message);
}

function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let i = 0; i < 6 && current; i += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      if ('code' in current && typeof current.code === 'string') {
        parts.push(current.code);
      }
      current = current.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join(' ');
}

function isHardNetworkFailure(message: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|AbortError|aborted|UND_ERR_(CONNECT|HEADERS|BODY)_TIMEOUT|timeout/i.test(
    message,
  );
}

function shouldRetryWithLaxTls(err: unknown): boolean {
  const text = errorChainText(err);
  if (isTlsFailure(text)) {
    return true;
  }
  return /fetch failed/i.test(text) && !isHardNetworkFailure(text);
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
    return new CrawlError(ORIGIN_PAGE_UNAVAILABLE, 'NETWORK', true);
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

const CRAWL_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/xml,*/*;q=0.8',
  'User-Agent': USER_AGENT,
};

function incomingToHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function requestOnce(
  targetUrl: string,
  options: { timeoutMs: number; maxBytes: number; insecureTls: boolean },
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      reject(new CrawlError(`URL inválida: ${targetUrl}`, 'PARSE', false));
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const requestOptions: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      timeout: options.timeoutMs,
      headers: {
        ...CRAWL_HEADERS,
        Host: parsed.host,
      },
    };
    if (isHttps && options.insecureTls) {
      requestOptions.agent = new https.Agent({ rejectUnauthorized: false });
    }

    const req = lib.request(requestOptions, (res) => {
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        res.resume();
        reject(tooLargeError(declared, options.maxBytes));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > options.maxBytes) {
          res.destroy();
          reject(tooLargeError(total, options.maxBytes));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks, total),
        });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(
        Object.assign(new Error(`Timeout tras ${options.timeoutMs}ms`), {
          code: 'ETIMEDOUT',
        }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

/** Node 20: no cargar el paquete npm `undici` 8 (exige markAsUncloneable de Node 22). */
async function fetchWithLaxTls(
  url: string,
  options: { timeoutMs: number; maxBytes: number },
): Promise<Response> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const result = await requestOnce(current, {
      ...options,
      insecureTls: true,
    });
    if (
      result.statusCode >= 300 &&
      result.statusCode < 400 &&
      result.headers.location
    ) {
      current = new URL(String(result.headers.location), current).toString();
      continue;
    }
    const response = new Response(new Uint8Array(result.body), {
      status: result.statusCode || 200,
      headers: incomingToHeaders(result.headers),
    });
    Object.defineProperty(response, 'url', { value: current });
    return response;
  }
  throw new CrawlError('Demasiados redirects HTTP', 'NETWORK', true);
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

  const requestInit: RequestInit = {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: CRAWL_HEADERS,
  };

  let response: Response;
  try {
    try {
      response = await fetch(url, requestInit);
    } catch (err) {
      if (!shouldRetryWithLaxTls(err)) {
        throw err;
      }
      // Sitios de gobierno con cadena TLS incompleta; no se desactiva TLS en el resto del crawl.
      console.warn(
        `crawl TLS laxo url=${url} reason=${errorChainText(err).slice(0, 200)}`,
      );
      response = await fetchWithLaxTls(url, { timeoutMs, maxBytes });
    }
  } catch (err) {
    const message = errorChainText(err) || String(err);
    console.warn(
      `crawl origen no disponible url=${url} reason=${message.slice(0, 200)}`,
    );
    throw new CrawlError(ORIGIN_PAGE_UNAVAILABLE, 'NETWORK', true);
  }

  if (!response.ok) {
    throw classifyHttp(response.status);
  }

  const body = await readBodyWithLimit(response, maxBytes);
  const finalUrl = response.url || url;
  const disposition = filenameFromContentDisposition(
    response.headers.get('content-disposition'),
  );
  const headerType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';
  const sniffed = sniffCrawlExtension({
    contentType: headerType,
    url: finalUrl,
    filename: disposition,
    body,
  });

  return {
    url,
    finalUrl,
    statusCode: response.status,
    contentType: contentTypeForSniff(sniffed, headerType),
    body,
    fetchedAt,
  };
}

function filenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  const quoted = /filename="([^"]+)"/i.exec(header);
  const plain = /filename=([^;]+)/i.exec(header);
  const raw = (star?.[1] || quoted?.[1] || plain?.[1] || '').trim();
  if (!raw) {
    return undefined;
  }
  try {
    return decodeURIComponent(raw.replace(/^['"]|['"]$/g, ''));
  } catch {
    return raw.replace(/^['"]|['"]$/g, '');
  }
}

export function contentTypeForSniff(
  sniffed: SniffedCrawlExt,
  headerType: string,
): string {
  if (sniffed === 'pdf') {
    return 'application/pdf';
  }
  if (sniffed === 'doc') {
    return 'application/msword';
  }
  if (sniffed === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (sniffed === 'xml') {
    return headerType.toLowerCase().includes('xml')
      ? headerType
      : 'application/xml';
  }
  if (sniffed === 'json') {
    return headerType.toLowerCase().includes('json')
      ? headerType
      : 'application/json';
  }
  return headerType;
}

export function sniffCrawlExtension(params: {
  contentType: string;
  url?: string;
  filename?: string;
  body?: Buffer;
}): SniffedCrawlExt {
  const type = (params.contentType || '').toLowerCase();
  const name = (params.filename || '').toLowerCase();
  if (
    type.includes('pdf') ||
    name.endsWith('.pdf') ||
    looksLikePdfBuffer(params.body) ||
    urlLooksLikePdf(params.url)
  ) {
    return 'pdf';
  }
  if (
    looksLikeDocxBuffer(params.body) ||
    name.endsWith('.docx') ||
    type.includes('wordprocessingml') ||
    type.includes('officedocument.word') ||
    /\.docx(?:$|\?|&)/i.test(params.url || '')
  ) {
    return 'docx';
  }
  if (
    looksLikeOleDocBuffer(params.body) ||
    name.endsWith('.doc') ||
    type.includes('msword') ||
    urlLooksLikeWord(params.url)
  ) {
    return 'doc';
  }
  if (type.includes('json') || name.endsWith('.json')) {
    return 'json';
  }
  if (
    type.includes('xml') ||
    name.endsWith('.xml') ||
    /\.xml(?:$|\?)/i.test(params.url || '')
  ) {
    return 'xml';
  }
  return 'html';
}

export function pageFilename(
  contentType: string,
  hints: { url?: string; filename?: string; body?: Buffer } = {},
): string {
  const ext = sniffCrawlExtension({
    contentType,
    url: hints.url,
    filename: hints.filename,
    body: hints.body,
  });
  return `page.${ext}`;
}
