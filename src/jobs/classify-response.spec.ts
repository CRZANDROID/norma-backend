import { ImpactLevel } from '../database/prisma-client';
import { parseClassifyResponse } from './classify-response';
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
