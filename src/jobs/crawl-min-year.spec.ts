import {
  crawlResourceIsBeforeMinYear,
  crawlUrlFromMetadata,
  explicitYearsInText,
  resolveCrawlMinYear,
  resourceIsBeforeMinYear,
  urlIsBeforeMinYear,
  yearsFromDateline,
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

  it('reads Mexican ddMMyyyy suffixes in CMS filenames', () => {
    expect(
      explicitYearsInText('Alerta_Sanitaria_DIONICA_30062023.pdf'),
    ).toEqual([2023]);
    expect(
      urlIsBeforeMinYear(
        'https://www.gob.mx/cms/uploads/attachment/file/835966/Alerta_Sanitaria_DIONICA_30062023.pdf',
        2026,
      ),
    ).toBe(true);
    expect(
      urlIsBeforeMinYear(
        'https://www.gob.mx/cms/uploads/attachment/file/705479/Alerta_Abbott_23022022_VF.pdf',
        2026,
      ),
    ).toBe(true);
    expect(
      urlIsBeforeMinYear(
        'https://www.gob.mx/cms/uploads/attachment/file/1/alerta_15032026.pdf',
        2026,
      ),
    ).toBe(false);
  });

  it('uses only the opening dateline, not later citations', () => {
    expect(
      yearsFromDateline(
        'Ciudad de México, a 23 de febrero de 2022 ALERTA SANITARIA SOBRE EL RETIRO',
      ),
    ).toEqual([2022]);
    expect(
      yearsFromDateline(
        'La Comisión emitió una alerta sanitaria el 30 de junio de 2023 sobre DIONICA.',
      ),
    ).toEqual([2023]);
    expect(
      resourceIsBeforeMinYear({
        url: 'https://www.gob.mx/cms/uploads/attachment/file/1/x.pdf',
        extractedText:
          'Ciudad de México, a 23 de febrero de 2022 ALERTA SANITARIA',
      }),
    ).toBe(true);
    const laterCitation = `${'Acuerdo publicado el 12 de enero de 2026.\n'}${'x'.repeat(2100)}Ley de 2011 y reformas de 2019`;
    expect(
      resourceIsBeforeMinYear({
        url: 'https://www.gob.mx/cms/uploads/attachment/file/1/x.pdf',
        extractedText: laterCitation,
      }),
    ).toBe(false);
    expect(
      resourceIsBeforeMinYear({
        url: 'https://www.gob.mx/cofepris/articulos/sin-fecha',
        filename: 'page.html',
        extractedText: 'Portada de la comisión sin fecha de publicación.',
      }),
    ).toBe(false);
  });
});
