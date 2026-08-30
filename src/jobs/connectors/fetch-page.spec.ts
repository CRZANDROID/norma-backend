import {
  DEFAULT_MAX_BYTES,
  pageFilename,
  resolveMaxBytes,
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

  it('defaults to 10 MB and accepts env override', () => {
    delete process.env.CRAWL_MAX_BYTES;
    expect(resolveMaxBytes()).toBe(DEFAULT_MAX_BYTES);
    expect(DEFAULT_MAX_BYTES).toBe(10_000_000);

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
