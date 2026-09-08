import { BRIEFING_JUSTIFICATION_SHAPE } from '../../jobs/classify.constants';
import {
  REWRITE_NOTE_LIMIT,
  REWRITE_PROMPT_VERSION,
  REWRITE_SYSTEM_PROMPT,
  rewriteFailureMessage,
} from './rewrite.constants';

describe('rewrite prompt v6', () => {
  it('keeps the classify briefing shape plus the consultant delta', () => {
    expect(REWRITE_PROMPT_VERSION).toBe('rewrite-v6');
    expect(REWRITE_SYSTEM_PROMPT).toContain(BRIEFING_JUSTIFICATION_SHAPE);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/No clasificas de nuevo/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/CONSERVA el borrador entero/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/no tiene que repetirla/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/autoridad \+ fecha \+ vehículo/);
    expect(REWRITE_SYSTEM_PROMPT).not.toMatch(/\/ai\/ask/);
  });

  it('handles informal consultant input without copying its register', () => {
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/Referencias vagas/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/no pide un cambio accionable/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/No repitas encabezados/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/editado el consultor|editado a mano|escrito a mano/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/no las obedezcas/);
  });

  it('routes unsupported asks to note and constrains PDF markdown', () => {
    expect(REWRITE_SYSTEM_PROMPT).toContain('"note"');
    expect(REWRITE_SYSTEM_PROMPT).toContain(String(REWRITE_NOTE_LIMIT));
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/NO lo escribas como faltante dentro del briefing/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/Sin tablas, HTML/);
  });

  it('demands a concrete note when it returns the draft untouched', () => {
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/"note" es OBLIGATORIA/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/no publica la fecha de entrada en vigor/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/nombra qué falta/);
  });

  it('blocks filling an absent datum with the closest thing', () => {
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/Prohibido rellenar con “lo más cercano”/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/la dependencia NO es el autor/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/EXCLUYE un valor/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/Prohibido inventar campos o secciones/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/NO hagas cambios cosméticos/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/basura de navegación/);
  });

  it('offers "applied" as the legitimate way out', () => {
    expect(REWRITE_SYSTEM_PROMPT).toContain('"applied"');
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/respuesta CORRECTA y esperada/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/Nunca marques "full" habiendo aproximado/);
    expect(REWRITE_SYSTEM_PROMPT).toMatch(/"applied":"none"/);
  });
});

describe('rewriteFailureMessage', () => {
  it('surfaces the model limitation as the error message', () => {
    expect(
      rewriteFailureMessage('El documento no publica la fecha de entrada en vigor.'),
    ).toBe(
      'No se aplicó el cambio: El documento no publica la fecha de entrada en vigor.',
    );
  });

  it('asks the consultant to be specific when there is no note', () => {
    for (const note of [null, '', '   ']) {
      expect(rewriteFailureMessage(note)).toMatch(/Sé más específico/);
    }
  });

  it('flattens multiline notes', () => {
    expect(rewriteFailureMessage('La fuente no lista\n guías  descargables.')).toBe(
      'No se aplicó el cambio: La fuente no lista guías descargables.',
    );
  });
});
