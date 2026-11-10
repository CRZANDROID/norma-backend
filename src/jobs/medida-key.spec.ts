import {
  chooseMedidaKeeper,
  findMedidaDuplicate,
  groupByMedida,
  medidaTitleKey,
  medidaUrlKey,
  type MedidaRow,
} from './medida-key';

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

function row(partial: Partial<MedidaRow> & Pick<MedidaRow, 'id'>): MedidaRow {
  return {
    url: null,
    title: null,
    createdAt: day(1),
    inReport: false,
    ...partial,
  };
}

describe('medidaUrlKey', () => {
  it('treats html, pdf and docx of the same path as one measure', () => {
    const html = medidaUrlKey('https://WWW.CONGRESO.GOB.MX/gaceta/nota.html#top');
    expect(html).toBe(medidaUrlKey('https://www.congreso.gob.mx/gaceta/nota.pdf'));
    expect(html).toBe(medidaUrlKey('https://www.congreso.gob.mx/gaceta/nota.docx/'));
    expect(html).toBe('https://www.congreso.gob.mx/gaceta/nota');
  });

  it('keeps a different query as a different measure', () => {
    expect(
      medidaUrlKey('https://www.dof.gob.mx/nota_detalle.php?codigo=1'),
    ).not.toBe(medidaUrlKey('https://www.dof.gob.mx/nota_detalle.php?codigo=2'));
  });

  it('does not use a portada url to pair measures', () => {
    expect(medidaUrlKey('https://www.congreso.gob.mx/')).toBeNull();
    expect(medidaUrlKey('https://www.congreso.gob.mx/index.html')).toBeNull();
  });
});

describe('medidaTitleKey', () => {
  it('collapses case and spaces, and ignores the generic green title', () => {
    expect(medidaTitleKey('  NOM-051   Etiquetado ')).toBe('nom-051 etiquetado');
    expect(medidaTitleKey('Sin relevancia operativa')).toBeNull();
  });
});

describe('classify medida guard', () => {
  const html = row({
    id: 'old',
    url: 'https://www.congreso.gob.mx/gaceta/nota.html',
    title: 'Otro título',
    createdAt: day(1),
  });
  const reported = row({
    id: 'reported',
    url: 'https://cdn.example/descarga?id=9',
    title: 'Reforma de etiquetado',
    createdAt: day(3),
    inReport: true,
  });
  const olderTitle = row({
    id: 'older',
    url: 'https://cdn.example/otro.pdf',
    title: 'Reforma de etiquetado',
    createdAt: day(2),
  });

  it('does not treat the same document path in another format as a new finding', () => {
    const twin = findMedidaDuplicate([html], {
      url: 'https://www.congreso.gob.mx/gaceta/nota.pdf',
      title: 'Título distinto del modelo',
    });
    expect(twin?.id).toBe('old');
  });

  it('pairs by gazette title when the urls cannot', () => {
    const twin = findMedidaDuplicate([html], {
      url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=9',
      title: 'Reforma de etiquetado',
    });
    expect(twin).toBeNull();

    const byTitle = findMedidaDuplicate([olderTitle, reported], {
      url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=9',
      title: 'Reforma de etiquetado',
    });
    expect(byTitle?.id).toBe('reported');
  });

  it('keeps the oldest when none of the copies is in a report', () => {
    const twin = findMedidaDuplicate(
      [
        row({
          id: 'newer',
          url: null,
          title: 'Acuerdo de etiquetado',
          createdAt: day(5),
        }),
        row({
          id: 'oldest',
          url: null,
          title: 'Acuerdo de etiquetado',
          createdAt: day(1),
        }),
      ],
      { url: null, title: 'Acuerdo de etiquetado' },
    );
    expect(twin?.id).toBe('oldest');
  });

  it('does not match a different measure', () => {
    expect(
      findMedidaDuplicate([html], {
        url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=2',
        title: 'Otra norma',
      }),
    ).toBeNull();
  });
});

describe('cleanup groups', () => {
  it('groups copies and leaves a single finding alone', () => {
    const groups = groupByMedida([
      row({
        id: 'a',
        url: 'https://www.congreso.gob.mx/gaceta/nota.html',
        title: 'Nota',
      }),
      row({
        id: 'b',
        url: 'https://www.congreso.gob.mx/gaceta/nota.pdf',
        title: 'Nota',
      }),
      row({
        id: 'solo',
        url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=3',
        title: 'Distinta',
      }),
    ]);
    const sizes = groups.map((group) => group.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it('prefers a finding already in a draft or sent report', () => {
    const keeper = chooseMedidaKeeper([
      row({ id: 'old', createdAt: day(1), inReport: false, title: 'Nota' }),
      row({ id: 'in-draft', createdAt: day(4), inReport: true, title: 'Nota' }),
    ]);
    expect(keeper.id).toBe('in-draft');
  });
});
