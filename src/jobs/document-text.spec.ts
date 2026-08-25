import {
  collapseWhitespace,
  extractVisibleHtmlText,
  isExtractableCrawlFile,
  sha256Normalized,
  validateExtractedText,
} from './document-text';

describe('extractVisibleHtmlText', () => {
  it('strips script/style/nav and keeps visible copy', () => {
    const html = `
      <html>
        <head><style>body { color: red }</style></head>
        <body>
          <nav>Menú principal</nav>
          <script>alert('x')</script>
          <article>
            <h1>Diario Oficial</h1>
            <p>Decreto por el que se reforman disposiciones en materia de comercio exterior.</p>
          </article>
        </body>
      </html>
    `;
    const text = extractVisibleHtmlText(html);
    expect(text).toContain('Diario Oficial');
    expect(text).toContain('comercio exterior');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('Menú principal');
  });

  it('decodes basic HTML entities', () => {
    const text = extractVisibleHtmlText('<p>A&nbsp;&amp;&nbsp;B</p>');
    expect(collapseWhitespace(text)).toBe('A & B');
  });
});

describe('sha256Normalized', () => {
  it('collapses whitespace so the same copy hashes equal', () => {
    const a = sha256Normalized('hola   mundo\n\nNORMA');
    const b = sha256Normalized('hola mundo NORMA');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('does not collide distinct texts', () => {
    expect(sha256Normalized('decreto uno')).not.toBe(
      sha256Normalized('decreto dos'),
    );
  });
});

describe('isExtractableCrawlFile', () => {
  it('accepts page.html and page.pdf, ignores meta.json', () => {
    expect(isExtractableCrawlFile('page.html', 'text/html')).toBe(true);
    expect(isExtractableCrawlFile('page.pdf', 'application/pdf')).toBe(true);
    expect(isExtractableCrawlFile('meta.json', 'application/json')).toBe(false);
  });
});

describe('validateExtractedText', () => {
  const longEnough =
    'El Diario Oficial de la Federación publica el decreto de prueba con texto suficiente para el registro documental del piloto NORMA.';

  it('rejects captcha pages', () => {
    const raw = '<html><body>Just a moment... Cloudflare captcha</body></html>';
    const result = validateExtractedText(raw, longEnough);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('captcha');
    }
  });

  it('rejects short visible text', () => {
    const result = validateExtractedText('<p>hola</p>', 'hola');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too-short');
    }
  });

  it('accepts a normal official page', () => {
    expect(validateExtractedText(`<p>${longEnough}</p>`, longEnough).ok).toBe(
      true,
    );
  });
});
