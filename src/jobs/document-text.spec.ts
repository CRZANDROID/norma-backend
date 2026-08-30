import {
  collapseWhitespace,
  extractVisibleHtmlText,
  isExtractableCrawlFile,
  isFramesetShell,
  isPdfContent,
  isWordContent,
  looksLikeOleDocBuffer,
  looksLikePdfBuffer,
  sha256Normalized,
  urlLooksLikePdf,
  urlLooksLikeWord,
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
  it('accepts page.html, inner doc-*.html and PDFs; ignores meta.json', () => {
    expect(isExtractableCrawlFile('page.html', 'text/html')).toBe(true);
    expect(isExtractableCrawlFile('doc-01-ab12cd34ef.html', 'text/html')).toBe(
      true,
    );
    expect(isExtractableCrawlFile('page.pdf', 'application/pdf')).toBe(true);
    expect(isExtractableCrawlFile('meta.json', 'application/json')).toBe(false);
  });

  it('accepts XML and octet-stream PDFs sniffed from the URL or magic bytes', () => {
    expect(isExtractableCrawlFile('gaceta.xml', 'text/xml')).toBe(true);
    expect(
      isExtractableCrawlFile('doc-02.bin', 'application/octet-stream', {
        url: 'https://congresoags.gob.mx/Home/Download?filename=convocatoria.pdf',
      }),
    ).toBe(true);
    expect(
      isExtractableCrawlFile('page.html', 'text/html', {
        buffer: Buffer.from('%PDF-1.4\n1 0 obj'),
      }),
    ).toBe(true);
    expect(
      isExtractableCrawlFile('nota.bin', 'application/octet-stream', {
        url: 'https://dof.gob.mx/nota_to_doc.php?codnota=5797407',
      }),
    ).toBe(true);
    expect(
      isExtractableCrawlFile('page.html', 'text/html', {
        buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      }),
    ).toBe(true);
  });
});

describe('pdf sniff', () => {
  it('detects magic bytes and Download?filename=.pdf URLs', () => {
    expect(looksLikePdfBuffer(Buffer.from('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdfBuffer(Buffer.from('<html></html>'))).toBe(false);
    expect(
      urlLooksLikePdf(
        'https://congresoags.gob.mx/Home/Download?filename=convocatoria.pdf',
      ),
    ).toBe(true);
    expect(
      isPdfContent('doc-01.html', 'application/octet-stream', {
        url: 'https://congresoags.gob.mx/Home/Download?filename=convocatoria.pdf',
      }),
    ).toBe(true);
  });
});

describe('word sniff', () => {
  it('detects OLE magic and DOF nota_to_doc.php', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(looksLikeOleDocBuffer(ole)).toBe(true);
    expect(
      urlLooksLikeWord(
        'https://dof.gob.mx/nota_to_doc.php?codnota=5797407',
      ),
    ).toBe(true);
    expect(
      isWordContent('page.html', 'application/msword', {
        url: 'https://dof.gob.mx/nota_to_doc.php?codnota=5797407',
        buffer: ole,
      }),
    ).toBe(true);
    expect(
      isPdfContent('page.html', 'application/msword', {
        url: 'https://dof.gob.mx/nota_to_doc.php?codnota=5797407',
        buffer: ole,
      }),
    ).toBe(false);
  });
});

describe('isFramesetShell', () => {
  it('detects empty frameset wrappers without article/main/p', () => {
    expect(
      isFramesetShell(
        '<html><frameset cols="200,*"><frame src="/menu"></frameset></html>',
      ),
    ).toBe(true);
    expect(
      isFramesetShell(
        '<html><frameset><p>contenido</p></frameset></html>',
      ),
    ).toBe(false);
  });
});

describe('validateExtractedText', () => {
  const longEnough =
    'El Diario Oficial de la Federación publica el decreto de prueba con texto suficiente para el registro documental del piloto NORMA.';

  it('rejects captcha pages', () => {
    const extracted =
      'Just a moment... Checking your browser before accessing the site. Enable JavaScript and cookies.';
    const result = validateExtractedText('<html></html>', extracted);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('captcha');
    }
  });

  it('does not treat Avada/Contact Form recaptcha CSS as a challenge page', () => {
    const raw = `
      <html>
        <head><style>.grecaptcha-badge{z-index:1}.wpcf7-captchar{width:100%}</style></head>
        <body>
          <h1>Orden del día</h1>
          <a href="/ORDEN_01.0_01MAYO2026.pdf">ORDEN_01.0_01MAYO2026.pdf</a>
          <p>${longEnough}</p>
        </body>
      </html>
    `;
    const extracted = extractVisibleHtmlText(raw);
    expect(validateExtractedText(raw, extracted).ok).toBe(true);
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

  it('does not treat PDF binary as a captcha page', () => {
    const raw = '%PDF-1.4 captcha token stream';
    expect(validateExtractedText(raw, longEnough, { kind: 'pdf' }).ok).toBe(
      true,
    );
  });

  it('uses a scanned-PDF empty message', () => {
    const result = validateExtractedText('%PDF-1.4', '', { kind: 'pdf' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty');
      expect(result.message).toMatch(/escaneado/i);
      expect(result.message).toMatch(/OCR/i);
    }
  });
});
