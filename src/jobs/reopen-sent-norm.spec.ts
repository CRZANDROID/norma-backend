import { describeNormChange, normIdentity } from './reopen-sent-norm';

describe('normIdentity', () => {
  it('treats slash, hash and host case as the same norm', () => {
    expect(normIdentity('https://WWW.DOF.GOB.MX/notas/123/#top')).toBe(
      normIdentity('https://www.dof.gob.mx/notas/123'),
    );
  });

  it('keeps a different query as a different norm', () => {
    expect(normIdentity('https://www.dof.gob.mx/nota.php?codigo=1')).not.toBe(
      normIdentity('https://www.dof.gob.mx/nota.php?codigo=2'),
    );
  });
});

describe('describeNormChange', () => {
  it('says the sent norm changed and quotes the new sentence', () => {
    const note = describeNormChange({
      sentAt: new Date('2026-10-01T18:00:00.000Z'),
      previousText: 'El decreto original fija el etiquetado frontal de bebidas.',
      nextText:
        'El decreto original fija el etiquetado frontal de bebidas. La reforma adelanta la vigencia al 1 de marzo.',
    });
    expect(note).toContain('ya se envió');
    expect(note).toContain('otro contenido');
    expect(note).toContain('La reforma adelanta la vigencia');
  });
});
