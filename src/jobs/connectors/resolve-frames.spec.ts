import type { FetchedPage } from './fetch-page';
import {
  followContentFrames,
  listFrameUrls,
  resolveSameOriginUrl,
  shouldFollowFrames,
} from './resolve-frames';

const DIPUTADOS_SHELL = `<!doctype html>
<html>
<head><title>Gaceta Parlamentaria, Cámara de Diputados</title></head>
<frameset rows="115px,*" frameborder="0">
  <frame src="gp_rotulo.html" noresize scrolling="no">
  <frameset cols="115px,*">
    <frame src="gp_indice.html" noresize scrolling="no">
    <frame src="gp_hoy.html" name="derecha" noresize scrolling="auto">
  </frameset>
</frameset>
</html>`;

function page(url: string, html: string): FetchedPage {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    contentType: 'text/html',
    body: Buffer.from(html, 'utf8'),
    fetchedAt: '2026-08-25T12:00:00.000Z',
  };
}

describe('resolve-frames', () => {
  it('lists same-origin frame URLs from a Diputados-like frameset', () => {
    expect(
      listFrameUrls(DIPUTADOS_SHELL, 'https://gaceta.diputados.gob.mx/'),
    ).toEqual([
      'https://gaceta.diputados.gob.mx/gp_rotulo.html',
      'https://gaceta.diputados.gob.mx/gp_indice.html',
      'https://gaceta.diputados.gob.mx/gp_hoy.html',
    ]);
  });

  it('ignores javascript, data and cross-origin frames', () => {
    const html = `
      <iframe src="javascript:alert(1)"></iframe>
      <iframe src="https://youtube.com/embed/x"></iframe>
      <iframe src="/contenido.html"></iframe>
    `;
    expect(listFrameUrls(html, 'https://gaceta.diputados.gob.mx/')).toEqual([
      'https://gaceta.diputados.gob.mx/contenido.html',
    ]);
    expect(
      resolveSameOriginUrl(
        'https://evil.example/x',
        'https://gaceta.diputados.gob.mx/',
      ),
    ).toBeNull();
  });

  it('follows framesets even if they only have a title', () => {
    expect(shouldFollowFrames(DIPUTADOS_SHELL)).toBe(true);
  });

  it('does not follow iframes on a page that already has usable text', () => {
    const html = `
      <html><body>
        <h1>Congreso del Estado</h1>
        <p>${'Sesión ordinaria con orden del día, iniciativas y dictámenes. '.repeat(4)}</p>
        <iframe src="https://www.youtube.com/embed/abc"></iframe>
      </body></html>
    `;
    expect(shouldFollowFrames(html)).toBe(false);
  });

  it('picks the content frame over chrome frames', async () => {
    const shell = page('https://gaceta.diputados.gob.mx/', DIPUTADOS_SHELL);
    const byUrl: Record<string, string> = {
      'https://gaceta.diputados.gob.mx/gp_rotulo.html':
        '<p>Martes 25 de agosto de 2026</p>',
      'https://gaceta.diputados.gob.mx/gp_indice.html':
        '<p>Hoy Anteriores Iniciativas Dictámenes</p>',
      'https://gaceta.diputados.gob.mx/gp_hoy.html': `<article>
          <h1>Gaceta Parlamentaria, año XXIX, número 7111</h1>
          <p>Prevenciones de la Mesa Directiva. Acuerdos de la Comisión de Seguridad Ciudadana y demás asuntos del orden del día de este martes.</p>
        </article>`,
    };

    const resolved = await followContentFrames(shell, async (url) => {
      const html = byUrl[url];
      if (!html) {
        throw new Error(`unexpected frame ${url}`);
      }
      return page(url, html);
    });

    expect(resolved.url).toBe('https://gaceta.diputados.gob.mx/');
    expect(resolved.finalUrl).toBe('https://gaceta.diputados.gob.mx/gp_hoy.html');
    expect(resolved.body.toString('utf8')).toContain('número 7111');
  });
});
