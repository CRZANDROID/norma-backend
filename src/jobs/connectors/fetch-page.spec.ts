import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ORIGIN_PAGE_UNAVAILABLE } from '../origin-page';
import { CrawlError } from '../types';
import {
  cookieHeaderFromJar,
  CRAWL_USER_AGENT,
  DEFAULT_MAX_BYTES,
  fetchPage,
  ingestSetCookies,
  pageFilename,
  parseSetCookieHeader,
  resolveMaxBytes,
  shouldRetryWithLaxTls,
  sniffCrawlExtension,
} from './fetch-page';

describe('fetch-page size limit', () => {
  const previous = process.env.CRAWL_MAX_BYTES;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.CRAWL_MAX_BYTES;
    } else {
      process.env.CRAWL_MAX_BYTES = previous;
    }
  });

  it('defaults to 25 MB and accepts env override', () => {
    delete process.env.CRAWL_MAX_BYTES;
    expect(resolveMaxBytes()).toBe(DEFAULT_MAX_BYTES);
    expect(DEFAULT_MAX_BYTES).toBe(25_000_000);

    process.env.CRAWL_MAX_BYTES = '8000000';
    expect(resolveMaxBytes()).toBe(8_000_000);
    expect(resolveMaxBytes(12_000_000)).toBe(12_000_000);
  });
});

describe('sniffCrawlExtension', () => {
  it('treats octet-stream downloads as PDF from magic bytes or query filename', () => {
    expect(
      sniffCrawlExtension({
        contentType: 'application/octet-stream',
        url: 'https://congresoags.gob.mx/Home/Download?filename=convocatoria.pdf',
      }),
    ).toBe('pdf');
    expect(
      sniffCrawlExtension({
        contentType: 'application/octet-stream',
        body: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBe('pdf');
    expect(pageFilename('application/octet-stream', { filename: 'a.pdf' })).toBe(
      'page.pdf',
    );
  });

  it('treats OLE Word and DOF nota_to_doc as .doc, not HTML', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(
      sniffCrawlExtension({
        contentType: 'application/msword',
        url: 'https://dof.gob.mx/nota_to_doc.php?codnota=5797407',
        body: ole,
      }),
    ).toBe('doc');
    expect(
      pageFilename('application/octet-stream', {
        url: 'https://dof.gob.mx/nota_to_doc.php?codnota=1',
        body: ole,
      }),
    ).toBe('page.doc');
  });

  it('keeps XML and HTML distinct', () => {
    expect(
      sniffCrawlExtension({
        contentType: 'text/xml',
        url: 'https://example.gob.mx/rss.xml',
      }),
    ).toBe('xml');
    expect(
      sniffCrawlExtension({
        contentType: 'text/html',
        url: 'https://example.gob.mx/',
      }),
    ).toBe('html');
  });
});

describe('crawl cookie jar', () => {
  const page = 'https://www.senado.gob.mx/66/gaceta_del_senado';

  it('stores Set-Cookie and sends it on the next hop of the same host', () => {
    const jar: Parameters<typeof ingestSetCookies>[0] = [];
    ingestSetCookies(jar, page, [
      'PHPSESSID=abc123; Path=/; HttpOnly',
      'portal=1; Domain=.senado.gob.mx; Path=/',
    ]);
    expect(parseSetCookieHeader('PHPSESSID=abc123; Path=/', page)).toEqual(
      expect.objectContaining({
        name: 'PHPSESSID',
        value: 'abc123',
        domain: 'www.senado.gob.mx',
        path: '/',
      }),
    );
    const header = cookieHeaderFromJar(jar, page);
    expect(header).toContain('PHPSESSID=abc123');
    expect(header).toContain('portal=1');
    expect(cookieHeaderFromJar(jar, 'https://www.diputados.gob.mx/')).toBe('');
  });
});

describe('shouldRetryWithLaxTls', () => {
  it('does not treat a redirect loop as a TLS failure', () => {
    expect(
      shouldRetryWithLaxTls(
        new CrawlError('Demasiados redirects HTTP', 'NETWORK', true),
      ),
    ).toBe(false);
    expect(shouldRetryWithLaxTls(new Error('redirect count exceeded'))).toBe(
      false,
    );
  });

  it('retries real certificate errors', () => {
    expect(
      shouldRetryWithLaxTls(new Error('unable to verify the first certificate')),
    ).toBe(true);
  });
});

function listen(
  handler: http.RequestListener,
): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('fetchPage cookies and redirects', () => {
  it('sends a Chrome UA and follows a Set-Cookie bounce on the same URL', async () => {
    const seen: { cookie?: string; ua?: string }[] = [];
    const server = await listen((req, res) => {
      seen.push({
        cookie: String(req.headers.cookie ?? ''),
        ua: String(req.headers['user-agent'] ?? ''),
      });
      if (!String(req.headers.cookie ?? '').includes('sess=ok')) {
        res.statusCode = 302;
        res.setHeader('Set-Cookie', 'sess=ok; Path=/');
        res.setHeader('Location', req.url || '/');
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body>gaceta</body></html>');
    });
    const { port } = server.address() as AddressInfo;
    try {
      const page = await fetchPage(`http://127.0.0.1:${port}/gaceta`);
      expect(page.statusCode).toBe(200);
      expect(page.body.toString()).toContain('gaceta');
      expect(seen).toHaveLength(2);
      expect(seen[0]?.cookie).toBe('');
      expect(seen[1]?.cookie).toContain('sess=ok');
      expect(seen[0]?.ua).toBe(CRAWL_USER_AGENT);
    } finally {
      await closeServer(server);
    }
  });

  it('stops a redirect loop as origin unavailable, without spinning', async () => {
    const server = await listen((req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', req.url || '/');
      res.end();
    });
    const { port } = server.address() as AddressInfo;
    try {
      await expect(fetchPage(`http://127.0.0.1:${port}/loop`)).rejects.toMatchObject({
        message: ORIGIN_PAGE_UNAVAILABLE,
      });
    } finally {
      await closeServer(server);
    }
  });
});
