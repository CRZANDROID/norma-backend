import {
  crawlResourceIsBeforeMinYear,
  crawlUrlFromMetadata,
  explicitYearsInText,
  resolveCrawlMinYear,
  urlIsBeforeMinYear,
} from './crawl-min-year';

describe('crawl-min-year', () => {
  const prev = process.env.CRAWL_MIN_YEAR;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.CRAWL_MIN_YEAR;
    } else {
      process.env.CRAWL_MIN_YEAR = prev;
    }
  });

  it('defaults to 2026 and accepts CRAWL_MIN_YEAR', () => {
    delete process.env.CRAWL_MIN_YEAR;
    expect(resolveCrawlMinYear()).toBe(2026);
    process.env.CRAWL_MIN_YEAR = '2027';
    expect(resolveCrawlMinYear()).toBe(2027);
    process.env.CRAWL_MIN_YEAR = 'nope';
    expect(resolveCrawlMinYear()).toBe(2026);
  });

  it('reads years from DOF fecha, path segments and compact dates', () => {
    expect(
      explicitYearsInText(
        'https://www.dof.gob.mx/nota_detalle.php?codigo=9&fecha=07/09/2024',
      ),
    ).toEqual([2024]);
    expect(
      explicitYearsInText('https://congresoags.gob.mx/gaceta/2026/enero.pdf'),
    ).toEqual([2026]);
    expect(explicitYearsInText('ORDEN_01.0_01MAYO2024.pdf')).toEqual([2024]);
    expect(explicitYearsInText('gaceta-20240907.pdf')).toEqual([2024]);
  });

  it('treats only all-old years as before min year; undated stays in', () => {
    expect(
      urlIsBeforeMinYear(
        'https://www.dof.gob.mx/nota_detalle.php?fecha=07/09/2024',
        2026,
      ),
    ).toBe(true);
    expect(
      urlIsBeforeMinYear(
        'https://www.dof.gob.mx/nota_detalle.php?fecha=07/09/2026',
        2026,
      ),
    ).toBe(false);
    expect(
      urlIsBeforeMinYear('https://www.dof.gob.mx/nota_detalle.php?codigo=9', 2026),
    ).toBe(false);
    expect(
      urlIsBeforeMinYear(
        'https://congresoags.gob.mx/gaceta/2024/reforma-2026.pdf',
        2026,
      ),
    ).toBe(false);
  });

  it('reads crawl URL from document metadata', () => {
    expect(
      crawlUrlFromMetadata({
        url: 'https://a.example/x',
        finalUrl: 'https://a.example/y',
      }),
    ).toBe('https://a.example/y');
    expect(
      crawlResourceIsBeforeMinYear({
        url: 'https://www.dof.gob.mx/nota_detalle.php?fecha=01/02/2019',
        filename: 'page.html',
      }),
    ).toBe(true);
    expect(
      crawlResourceIsBeforeMinYear({
        url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=1',
        filename: 'ORDEN_01MAYO2024.pdf',
      }),
    ).toBe(true);
  });
});
