import { CrawlError } from '../types';
import { crawlSite } from './site-crawl';
import type { FetchedPage } from './fetch-page';
import type { ConnectorSource } from './types';

function page(url: string, html: string): FetchedPage {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    contentType: 'text/html',
    body: Buffer.from(html, 'utf8'),
    fetchedAt: '2026-08-30T15:00:00.000Z',
  };
}

const source: ConnectorSource = {
  id: 'src-1',
  code: 'congreso-agu',
  name: 'Congreso de Aguascalientes',
  url: 'https://congresoags.gob.mx/',
  searchFocus: ['iniciativas'],
  notes: null,
  sections: [['Gaceta'], ['Iniciativas']],
};

describe('crawlSite', () => {
  it('follows same-origin legislative links instead of stopping at the home', async () => {
    const fetched: string[] = [];
    const htmlByUrl: Record<string, string> = {
      'https://congresoags.gob.mx/': `
        <a href="https://facebook.com/congreso">red</a>
        <a href="/noticias">noticias</a>
        <a href="/trabajo/gaceta">gaceta</a>
        <a href="/iniciativas/lista">iniciativas</a>
      `,
      'https://congresoags.gob.mx/trabajo/gaceta':
        '<article>Gaceta parlamentaria del 30 de agosto</article>',
      'https://congresoags.gob.mx/iniciativas/lista':
        '<article>Iniciativa de reforma sanitaria</article><a href="/iniciativas/detalle-1">detalle</a>',
      'https://congresoags.gob.mx/iniciativas/detalle-1':
        '<article>Texto completo de la iniciativa</article>',
      'https://congresoags.gob.mx/noticias': '<p>Boletín de prensa</p>',
    };

    const pages = await crawlSite(source, {
      maxPages: 4,
      maxDepth: 2,
      delayMs: 0,
      fetch: async (url) => {
        fetched.push(url);
        const html = htmlByUrl[url];
        if (!html) {
          throw new CrawlError(`missing mock ${url}`, 'NETWORK', true);
        }
        return page(url, html);
      },
    });

    const urls = pages.map((item) => item.page.finalUrl);
    expect(urls[0]).toBe('https://congresoags.gob.mx/');
    expect(urls).toContain('https://congresoags.gob.mx/trabajo/gaceta');
    expect(urls).toContain('https://congresoags.gob.mx/iniciativas/lista');
    expect(fetched.some((url) => url.includes('facebook'))).toBe(false);
    expect(pages).toHaveLength(4);
    expect(new Set(pages.map((item) => item.filename)).size).toBe(4);
  });

  it('fails if the start URL cannot be fetched', async () => {
    await expect(
      crawlSite(source, {
        delayMs: 0,
        fetch: async () => {
          throw new CrawlError('HTTP 500', 'NETWORK', true);
        },
      }),
    ).rejects.toBeInstanceOf(CrawlError);
  });

  it('skips empty inner pages and names PDFs from magic bytes', async () => {
    const pdfBody = Buffer.from('%PDF-1.4\n1 0 obj\n');
    const pages = await crawlSite(source, {
      maxPages: 4,
      maxDepth: 1,
      delayMs: 0,
      fetch: async (url) => {
        if (url.endsWith('/')) {
          return page(
            url,
            `<a href="/trabajo/gaceta">gaceta</a><a href="/Home/Download?filename=x.pdf">pdf</a><a href="/vacio">vacio</a>`,
          );
        }
        if (url.includes('vacio')) {
          return {
            url,
            finalUrl: url,
            statusCode: 200,
            contentType: 'text/html',
            body: Buffer.alloc(0),
            fetchedAt: '2026-08-30T15:00:00.000Z',
          };
        }
        if (url.includes('Download')) {
          return {
            url,
            finalUrl: url,
            statusCode: 200,
            contentType: 'application/octet-stream',
            body: pdfBody,
            fetchedAt: '2026-08-30T15:00:00.000Z',
          };
        }
        return page(url, '<article>Gaceta parlamentaria del 30 de agosto con texto.</article>');
      },
    });

    expect(pages.some((item) => item.page.finalUrl.includes('vacio'))).toBe(
      false,
    );
    const pdf = pages.find((item) => item.page.finalUrl.includes('Download'));
    expect(pdf?.filename).toMatch(/\.pdf$/);
  });

  it('fetches PDFs from a listing even when the HTML menu would fill the queue', async () => {
    const pdfBody = Buffer.from('%PDF-1.4\n1 0 obj\n');
    const fetched: string[] = [];
    const pages = await crawlSite(source, {
      maxPages: 5,
      maxDepth: 2,
      delayMs: 0,
      fetch: async (url) => {
        fetched.push(url);
        if (url === 'https://congresoags.gob.mx/' || url.endsWith('congresoags.gob.mx/')) {
          return page(
            url,
            `<a href="/historia">historia</a><a href="/junta">junta</a><a href="/orden-del-dia">orden</a>`,
          );
        }
        if (url.includes('orden-del-dia')) {
          return page(
            url,
            `<a href="/uploads/ORDEN_01.0_01MAYO2026.pdf">ORDEN_01.0_01MAYO2026.pdf</a>
             <a href="/uploads/ORDEN_02.0_07MAYO2026.pdf">ORDEN_02.0_07MAYO2026.pdf</a>`,
          );
        }
        if (url.includes('.pdf')) {
          return {
            url,
            finalUrl: url,
            statusCode: 200,
            contentType: 'application/pdf',
            body: pdfBody,
            fetchedAt: '2026-08-30T15:00:00.000Z',
          };
        }
        return page(url, `<article>Sección institucional ${url}</article>`);
      },
    });

    expect(fetched.some((url) => url.includes('.pdf'))).toBe(true);
    expect(pages.some((item) => item.filename.endsWith('.pdf'))).toBe(true);
    expect(pages.some((item) => item.page.finalUrl.includes('orden-del-dia'))).toBe(
      true,
    );
  });

  it('follows a same-host meta-refresh stub instead of saving the bounce page', async () => {
    const fetched: string[] = [];
    const pages = await crawlSite(
      { ...source, url: 'https://www.congresocoahuila.gob.mx/' },
      {
        maxPages: 3,
        maxDepth: 1,
        delayMs: 0,
        fetch: async (url) => {
          fetched.push(url);
          if (url === 'https://www.congresocoahuila.gob.mx/') {
            return page(
              url,
              `<!doctype html><html><head><title>Domain Default page</title>
               <meta http-equiv="refresh" content="0; url=https://www.congresocoahuila.gob.mx/coahuila/" />
               </head><body></body></html>`,
            );
          }
          return page(
            url,
            `<article>H. Congreso del Estado de Coahuila</article>
             <a href="/gaceta/iniciativas.pdf">PDF</a>`,
          );
        },
      },
    );

    expect(fetched[0]).toBe('https://www.congresocoahuila.gob.mx/');
    expect(fetched).toContain('https://www.congresocoahuila.gob.mx/coahuila/');
    expect(
      pages.some(
        (item) => item.page.finalUrl === 'https://www.congresocoahuila.gob.mx/',
      ),
    ).toBe(false);
    expect(pages[0]?.page.finalUrl).toBe(
      'https://www.congresocoahuila.gob.mx/coahuila/',
    );
  });
});
