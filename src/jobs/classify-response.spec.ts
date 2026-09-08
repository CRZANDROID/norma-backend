import { ImpactLevel } from '../database/prisma-client';
import { parseClassifyResponse, parseRewriteResponse } from './classify-response';
import { snapshotSuggestedAction } from '../modules/clients/delivery.util';
import { DEFAULT_IMPACT_ACTIONS } from '../modules/clients/delivery.defaults';

describe('parseClassifyResponse', () => {
  it('parses JSON object with 4-level impact', () => {
    const parsed = parseClassifyResponse(
      JSON.stringify({
        relevant: true,
        impact: 'ORANGE',
        title: 'Etiquetado frontal',
        justification: 'Afecta empaques de bebidas del perfil Arca.',
      }),
    );
    expect(parsed).toEqual({
      relevant: true,
      impact: ImpactLevel.ORANGE,
      title: 'Etiquetado frontal',
      justification: 'Afecta empaques de bebidas del perfil Arca.',
    });
  });

  it('forces GREEN when relevant is false', () => {
    const parsed = parseClassifyResponse(`\`\`\`json
{"relevant":false,"impact":"RED","title":"Fuera de perfil","justification":"Habla de minería, no de bebidas."}
\`\`\``);
    expect(parsed.relevant).toBe(false);
    expect(parsed.impact).toBe(ImpactLevel.GREEN);
    expect(parsed.title).toBe('Fuera de perfil');
  });

  it('rejects missing justification', () => {
    expect(() =>
      parseClassifyResponse(
        JSON.stringify({ relevant: true, impact: 'YELLOW', title: 'Hola' }),
      ),
    ).toThrow(/justificación/);
  });

  it('keeps briefing line breaks in justification', () => {
    const parsed = parseClassifyResponse(
      JSON.stringify({
        relevant: true,
        impact: 'RED',
        title: 'Prohibición del uso de Eritrosina (Rojo 3 FD&C)',
        justification:
          '## Prohibición del uso de Eritrosina (Rojo 3 FD&C)\n\nEl 26 de mayo de 2026 la Secretaría de Salud publicó en el DOF un Acuerdo.\n\n- Gomitas\n- Gomas de mascar',
      }),
    );
    expect(parsed.justification).toContain('## Prohibición del uso de Eritrosina');
    expect(parsed.justification).toContain('\n- Gomitas\n');
    expect(parsed.justification).not.toMatch(/El documento menciona/);
  });
});

describe('parseRewriteResponse', () => {
  it('keeps title and justification without touching impact', () => {
    const parsed = parseRewriteResponse(
      JSON.stringify({
        title: 'NOM-051 etiquetado de bebidas',
        justification: '## NOM-051\n\nEl DOF publica la modificación.',
      }),
    );
    expect(parsed.title).toBe('NOM-051 etiquetado de bebidas');
    expect(parsed.justification).toContain('## NOM-051');
    expect(parsed.note).toBeNull();
    expect(parsed.applied).toBe('full');
  });

  it('reads the self-reported applied flag', () => {
    const cases: Array<[unknown, string]> = [
      ['none', 'none'],
      ['NINGUNO', 'none'],
      ['partial', 'partial'],
      ['Parcial', 'partial'],
      ['full', 'full'],
      [undefined, 'full'],
      ['si', 'full'],
    ];
    for (const [value, expected] of cases) {
      const parsed = parseRewriteResponse(
        JSON.stringify({ title: 'T', justification: 'J', applied: value }),
      );
      expect(parsed.applied).toBe(expected);
    }
  });

  it('reads the note when the document does not support the ask', () => {
    const parsed = parseRewriteResponse(
      JSON.stringify({
        title: 'NOM-051 etiquetado de bebidas',
        justification: '## NOM-051\n\nEl DOF publica la modificación.',
        note: 'El documento  no fija\nfecha de entrada en vigor.',
      }),
    );
    expect(parsed.note).toBe(
      'El documento no fija fecha de entrada en vigor.',
    );
  });

  it('treats missing, null-ish or oversized notes as safe values', () => {
    const nulled = parseRewriteResponse(
      JSON.stringify({ title: 'T', justification: 'J', note: 'null' }),
    );
    expect(nulled.note).toBeNull();

    const long = parseRewriteResponse(
      JSON.stringify({ title: 'T', justification: 'J', note: 'x'.repeat(500) }),
      240,
    );
    expect(long.note).toHaveLength(240);
  });
});

describe('snapshotSuggestedAction', () => {
  it('reads suggestedAction from client delivery config', () => {
    expect(snapshotSuggestedAction(ImpactLevel.RED, DEFAULT_IMPACT_ACTIONS)).toBe(
      'Alertar de inmediato y preparar nota ejecutiva',
    );
    expect(snapshotSuggestedAction(ImpactLevel.GREEN, null)).toBe(
      'Registrar como contexto',
    );
  });
});
