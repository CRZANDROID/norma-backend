import {
  discoverLinks,
  gobMxUrlInSourceScope,
  linkScore,
  metaRefreshStubTarget,
  normalizeCrawlUrl,
  sameSite,
  sectionHints,
  shouldSaveCrawledPage,
} from './discover-links';

describe('sameSite', () => {
  it('treats www and apex as the same congress host', () => {
    expect(
      sameSite('https://congresoags.gob.mx/', 'https://www.congresoags.gob.mx/gaceta'),
    ).toBe(true);
  });

  it('rejects other domains and social networks', () => {
    expect(
      sameSite('https://dof.gob.mx/', 'https://www.facebook.com/dof'),
    ).toBe(false);
    expect(
      sameSite('https://www.congresojal.gob.mx/', 'https://www.congresobc.gob.mx/'),
    ).toBe(false);
  });
});

describe('normalizeCrawlUrl', () => {
  const base = 'https://www.dof.gob.mx/';

  it('resolves relative legislative links', () => {
    expect(normalizeCrawlUrl(base, 'nota_detalle.php?codigo=123')).toBe(
      'https://www.dof.gob.mx/nota_detalle.php?codigo=123',
    );
  });

  it('drops hash, mailto, assets and transparencia dumps', () => {
    expect(normalizeCrawlUrl(base, '#top')).toBeNull();
    expect(normalizeCrawlUrl(base, 'mailto:info@dof.gob.mx')).toBeNull();
    expect(normalizeCrawlUrl(base, '/logo.png')).toBeNull();
    expect(normalizeCrawlUrl(base, '/transparencia/sipot')).toBeNull();
  });

  it('drops live video players', () => {
    expect(
      normalizeCrawlUrl(
        'https://www.congresocam.gob.mx/',
        '/transmision-en-vivo/',
      ),
    ).toBeNull();
  });
});

describe('metaRefreshStubTarget', () => {
  it('follows a same-host Domain Default bounce', () => {
    const html = `<!doctype html><html><head><title>Domain Default page</title>
      <meta http-equiv="refresh" content="0; url=https://www.congresocoahuila.gob.mx/coahuila/" />
      </head><body></body></html>`;
    expect(
      metaRefreshStubTarget(html, 'https://www.congresocoahuila.gob.mx/'),
    ).toBe('https://www.congresocoahuila.gob.mx/coahuila/');
  });

  it('does not follow a refresh to another congress', () => {
    const html = `<meta http-equiv="refresh" content="0; url=https://web.congresochiapas.gob.mx/" />`;
    expect(
      metaRefreshStubTarget(html, 'https://www.congresojal.gob.mx/'),
    ).toBeNull();
  });

  it('follows a refresh to a sister subdomain of the same gob.mx site', () => {
    const html = `<meta http-equiv="refresh" content="0; url=https://web.congresochiapas.gob.mx/" />`;
    expect(
      metaRefreshStubTarget(html, 'https://www.congresochiapas.gob.mx/'),
    ).toBe('https://web.congresochiapas.gob.mx/');
  });
});

describe('discoverLinks', () => {
  it('keeps same-origin legislative URLs and frame src, ordered by score', () => {
    const html = `
      <html>
        <frameset>
          <frame src="/interior.html">
        </frameset>
        <a href="https://facebook.com/congreso">Facebook</a>
        <a href="/noticias/boletines">Boletines</a>
        <a href="nota_detalle.php?codigo=9">Nota DOF</a>
        <a href="/gaceta/iniciativas.pdf">PDF</a>
      </html>
    `;
    const links = discoverLinks(html, 'https://www.dof.gob.mx/index.php');
    expect(links).toContain('https://www.dof.gob.mx/nota_detalle.php?codigo=9');
    expect(links).toContain('https://www.dof.gob.mx/gaceta/iniciativas.pdf');
    expect(links).toContain('https://www.dof.gob.mx/interior.html');
    expect(links.some((url) => url.includes('facebook'))).toBe(false);
    expect(linkScore(links[0])).toBeGreaterThanOrEqual(linkScore(links[links.length - 1]));
  });

  it('boosts section labels from the source catalog', () => {
    const hints = sectionHints([['Gaceta'], ['Iniciativas']]);
    expect(hints).toEqual(['Gaceta', 'Iniciativas']);
    expect(linkScore('https://congresoags.gob.mx/gaceta', hints)).toBeGreaterThan(
      linkScore('https://congresoags.gob.mx/contacto', hints),
    );
  });

  it('does not treat administrative PDFs as legislative and skips archive dumps', () => {
    expect(
      linkScore(
        'https://www.cbcs.gob.mx/gaceta/iniciativas.pdf',
      ),
    ).toBeGreaterThan(
      linkScore(
        'https://www.cbcs.gob.mx/AREAS-CONGRESO/REC-MATERIALES/INVENTARIO-BIENES-MUEBLES.pdf',
      ),
    );
    expect(
      normalizeCrawlUrl(
        'https://www.cbcs.gob.mx/',
        '/AREAS-CONGRESO/COORD-ARCHIVO/cadido/cadido_congreso_bcs.pdf',
      ),
    ).toBeNull();
    expect(
      normalizeCrawlUrl(
        'https://www.cbcs.gob.mx/',
        '/AREAS-CONGRESO/REC-MATERIALES/INVENTARIO-BIENES-MUEBLES.pdf',
      ),
    ).toBeNull();
  });

  it('drops gazette URLs with an explicit year before 2026 and keeps 2026+', () => {
    expect(
      normalizeCrawlUrl(
        'https://www.dof.gob.mx/',
        'nota_detalle.php?codigo=1&fecha=07/09/2024',
      ),
    ).toBeNull();
    expect(
      normalizeCrawlUrl(
        'https://congresoags.gob.mx/',
        '/gaceta/2023/enero.pdf',
      ),
    ).toBeNull();
    expect(
      normalizeCrawlUrl(
        'https://www.dof.gob.mx/',
        'nota_detalle.php?codigo=1&fecha=07/09/2026',
      ),
    ).toBe('https://www.dof.gob.mx/nota_detalle.php?codigo=1&fecha=07/09/2026');
    expect(
      linkScore(
        'https://congresoags.gob.mx/gaceta/2026/iniciativas.pdf',
      ),
    ).toBeGreaterThan(
      linkScore('https://congresoags.gob.mx/gaceta/iniciativas.pdf'),
    );
    expect(
      shouldSaveCrawledPage({
        url: 'https://congresoags.gob.mx/historia',
        depth: 1,
      }),
    ).toBe(false);
    expect(
      shouldSaveCrawledPage({
        url: 'https://congresoags.gob.mx/trabajo/gaceta',
        depth: 1,
      }),
    ).toBe(true);
    expect(
      shouldSaveCrawledPage({
        url: 'https://congresoags.gob.mx/historia',
        depth: 0,
      }),
    ).toBe(true);
    expect(
      shouldSaveCrawledPage({
        url: 'https://congresoags.gob.mx/uploads/x.pdf',
        depth: 2,
        binary: true,
      }),
    ).toBe(true);
  });

  it('keeps gob.mx crawls inside the source path and allows dated CMS uploads', () => {
    const scope = 'https://www.gob.mx/cofepris';
    expect(
      gobMxUrlInSourceScope(scope, 'https://www.gob.mx/economia'),
    ).toBe(false);
    expect(
      normalizeCrawlUrl(scope, '/economia', { scopeUrl: scope }),
    ).toBeNull();
    expect(
      normalizeCrawlUrl(scope, '/conamer', { scopeUrl: scope }),
    ).toBeNull();
    expect(
      normalizeCrawlUrl(
        'https://www.gob.mx/cofepris/es/articulos',
        '/cofepris/es/articulos/alerta-2026',
        { scopeUrl: scope },
      ),
    ).toBe('https://www.gob.mx/cofepris/es/articulos/alerta-2026');
    expect(
      normalizeCrawlUrl(
        'https://www.gob.mx/cofepris/es/articulos',
        'https://www.gob.mx/cms/uploads/attachment/file/1/alerta-2026.pdf',
        { scopeUrl: scope },
      ),
    ).toBe(
      'https://www.gob.mx/cms/uploads/attachment/file/1/alerta-2026.pdf',
    );
    expect(
      normalizeCrawlUrl(
        'https://www.gob.mx/cofepris/es/articulos',
        'https://www.gob.mx/cms/uploads/attachment/file/835966/Alerta_Sanitaria_DIONICA_30062023.pdf',
        { scopeUrl: scope },
      ),
    ).toBeNull();
    const html = `
      <a href="https://www.gob.mx/economia">Economía</a>
      <a href="https://www.gob.mx/cms/uploads/attachment/file/1/alerta-2026.pdf">PDF</a>
      <a href="/cofepris/prensa">Prensa</a>
    `;
    const links = discoverLinks(html, 'https://www.gob.mx/cofepris', [], scope);
    expect(links.some((url) => url.includes('/economia'))).toBe(false);
    expect(links).toContain(
      'https://www.gob.mx/cms/uploads/attachment/file/1/alerta-2026.pdf',
    );
    expect(links).toContain('https://www.gob.mx/cofepris/prensa');
  });
});
