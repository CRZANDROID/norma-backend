import {
  discoverLinks,
  linkScore,
  normalizeCrawlUrl,
  sameSite,
  sectionHints,
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
});
