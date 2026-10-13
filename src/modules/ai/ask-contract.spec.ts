import {
  ASK_HISTORY_LIMIT,
  CATALOG_BLOCK_MARKER,
  NORMA_SYSTEM_PROMPT,
} from './ai.constants';
import {
  buildAskMessages,
  htmlToVisibleText,
  parseModelPayload,
  sanitizeAskDraft,
  trimAskHistory,
  withoutSaveReminder,
} from './ask-contract';

describe('ask contract', () => {
  it('keeps the last 15 turns', () => {
    const messages = Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turno ${index}`,
    }));
    const trimmed = trimAskHistory(messages);
    expect(trimmed).toHaveLength(ASK_HISTORY_LIMIT);
    expect(trimmed[0]?.content).toBe('turno 1');
    expect(trimmed.at(-1)?.content).toBe('turno 15');
  });

  it('sends the catalog once and leaves it out of the question and the history', () => {
    const history = [
      { role: 'user' as const, content: '¿Qué clientes tengo?' },
    ];
    const messages = buildAskMessages({
      catalog: { clientes: [{ nombre: 'Arca' }], fuentes: [] },
      history,
      question: '¿Qué fuentes tiene Arca?',
      draftTarget: null,
      evidence: 'Esto no va en este turno',
    });
    const catalogMessages = messages.filter((message) =>
      message.content.includes(CATALOG_BLOCK_MARKER),
    );
    expect(catalogMessages).toHaveLength(1);
    expect(messages.at(-1)?.content).toBe('¿Qué fuentes tiene Arca?');
    expect(messages.at(-1)?.content).not.toContain(CATALOG_BLOCK_MARKER);
    expect(history[0]?.content).toBe('¿Qué clientes tengo?');
    expect(
      messages.filter((message) => message.content.includes('Esto no va')),
    ).toHaveLength(1);
  });

  it('names the open screen once and keeps it out of the question', () => {
    const messages = buildAskMessages({
      catalog: { clientes: [{ nombre: 'Arca' }], fuentes: [{ nombre: 'DOF' }] },
      history: [],
      question: '¿Qué estoy viendo?',
      draftTarget: null,
      screen: 'fuentes',
    });
    const screenMessages = messages.filter((message) =>
      message.content.includes('Pantalla actual: Fuentes'),
    );
    expect(screenMessages).toHaveLength(1);
    expect(screenMessages[0]?.content).toMatch(/solo con las fuentes/);
    expect(messages.at(-1)?.content).toBe('¿Qué estoy viendo?');
    expect(messages.at(-1)?.content).not.toContain('Pantalla actual');
  });

  it('describes a profile as the agent signals, not the client name', () => {
    expect(NORMA_SYSTEM_PROMPT).toMatch(/categorías y keywords/);
    expect(NORMA_SYSTEM_PROMPT).toMatch(
      /nombre y la descripción son del cliente/,
    );
    expect(NORMA_SYSTEM_PROMPT).not.toMatch(
      /Perfil regulatorio, en Clientes: Nombre, Descripción/,
    );
  });

  it('drops the save reminder from a general answer', () => {
    expect(
      withoutSaveReminder(
        'Arca está activo. No se guarda hasta que pulses Crear perfil o Guardar cambios.',
      ),
    ).toBe('Arca está activo.');
  });

  it('forces draft null without a target and drops the other target', () => {
    const invented = {
      target: 'profile',
      profile: { name: 'Otra', keywords: ['refrescos'] },
    };
    expect(
      sanitizeAskDraft(invented, {
        draftTarget: null,
        evidenceText: 'refrescos',
      }),
    ).toBeNull();
    expect(
      sanitizeAskDraft(
        { target: 'source', source: { keywordsGuide: ['refrescos'] } },
        {
          draftTarget: 'profile',
          companyName: 'Acme',
          evidenceText: 'refrescos',
        },
      )?.target,
    ).toBe('profile');
  });

  it('copies the written company name and drops fields the evidence does not support', () => {
    const draft = sanitizeAskDraft(
      {
        target: 'profile',
        profile: {
          name: 'Inventada',
          description: 'texto del modelo',
          keywords: ['refrescos', '', 12, 'fiscal inventado'],
          categories: ['salud'],
          products: ['botanas'],
          rfc: 'XAXX010101000',
        },
      },
      {
        draftTarget: 'profile',
        companyName: 'Acme',
        writtenDescription: 'La que escribió',
        evidenceText: 'Acme vende refrescos y botanas',
      },
    );
    expect(draft).toEqual({
      target: 'profile',
      profile: {
        name: 'Acme',
        description: 'La que escribió',
        keywords: ['refrescos'],
        products: ['botanas'],
      },
    });
  });

  it('keeps only sanitary words grounded in the page', () => {
    const draft = sanitizeAskDraft(
      {
        target: 'source',
        source: {
          name: 'DOF',
          url: 'https://ejemplo.gob.mx',
          keywordsGuide: ['etiquetado', 'youtube'],
          searchFocus: ['norma sanitaria de bebidas'],
        },
      },
      {
        draftTarget: 'source',
        evidenceText: 'Norma sanitaria de bebidas y etiquetado de alimentos',
      },
    );
    expect(draft).toEqual({
      target: 'source',
      source: {
        keywordsGuide: ['etiquetado'],
        searchFocus: ['norma sanitaria de bebidas'],
      },
    });
  });

  it('reads visible HTML and ignores scripts', () => {
    const text = htmlToVisibleText(
      '<html><style>.x{color:red}</style><script>secreto fiscal</script><body><h1>Norma sanitaria de bebidas</h1><p>Etiquetado de alimentos para la salud publica del etiquetado.</p></body></html>',
    );
    expect(text).toContain('Norma sanitaria de bebidas');
    expect(text).not.toContain('secreto');
    expect(text).not.toContain('color:red');
  });

  it('rejects a completion that is not the JSON object', () => {
    expect(() => parseModelPayload('solo prosa')).toThrow();
    expect(parseModelPayload('{"answer":"Consta.","draft":null}')).toEqual({
      answer: 'Consta.',
      draft: null,
    });
  });
});
