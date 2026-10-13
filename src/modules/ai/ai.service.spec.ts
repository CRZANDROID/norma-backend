import { UserRole } from '../../database/prisma-client';
import { fetchPage } from '../../jobs/connectors/fetch-page';
import type { AuthUser } from '../auth/auth.types';
import { CATALOG_BLOCK_MARKER, CHAT_TEMPERATURE } from './ai.constants';
import { AiService } from './ai.service';

jest.mock('../../jobs/connectors/fetch-page', () => ({
  fetchPage: jest.fn(),
}));

const fetchPageMock = fetchPage as jest.MockedFunction<typeof fetchPage>;

describe('AiService.ask', () => {
  const user: AuthUser = {
    id: 'u',
    email: 'ana@norma.local',
    name: 'Ana',
    role: UserRole.ANALYST,
    memberships: [],
  };
  const stats = {
    clientCount: 1,
    profileCount: 1,
    sourceCount: 2,
    scopedToClientId: null,
  };
  const catalog = {
    build: jest.fn().mockResolvedValue({
      catalog: { clientes: [{ nombre: 'Propio' }], fuentes: [] },
      stats,
    }),
  };
  const create = jest.fn(
    (body: { messages: Array<{ role: string; content: string }> }) =>
      Promise.resolve({
        body,
        model: 'gpt-4o-mini',
        choices: [{ message: { content: '' } }],
      }),
  );
  const openai = {
    ensureClient: jest.fn().mockReturnValue({
      chat: { completions: { create } },
    }),
    getModel: jest.fn().mockReturnValue('gpt-4o-mini'),
  };
  const webSearch = { search: jest.fn() };
  const service = new AiService(openai as never, catalog as never, webSearch);

  beforeEach(() => {
    create.mockReset();
    webSearch.search.mockReset();
    fetchPageMock.mockReset();
    create.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Consta en tus registros.',
              draft: {
                target: 'profile',
                profile: { name: 'Inventada', keywords: ['refrescos'] },
              },
            }),
          },
        },
      ],
    });
  });

  it('nulls a draft the model invented when the form did not ask for one', async () => {
    const result = await service.ask(user, {
      question: '¿Qué clientes tengo activos?',
    });
    expect(result.draft).toBeNull();
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(fetchPageMock).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: CHAT_TEMPERATURE,
      response_format: { type: 'json_object' },
    });
    expect(create.mock.calls[0][0].tools).toBeUndefined();
  });

  it('drops a save reminder from a general answer and sends the open screen', async () => {
    create.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Estás en Clientes, con Arca activo. No se guarda hasta que pulses Crear perfil o Guardar cambios.',
              draft: null,
            }),
          },
        },
      ],
    });
    const result = await service.ask(user, {
      question: '¿Qué estoy viendo?',
      screen: 'clientes',
    });
    expect(result.draft).toBeNull();
    expect(result.answer).toBe('Estás en Clientes, con Arca activo.');
    const sent = create.mock.calls[0][0].messages;
    expect(
      sent.filter((message) =>
        message.content.includes('Pantalla actual: Clientes'),
      ),
    ).toHaveLength(1);
    expect(sent.at(-1)?.content).toBe('¿Qué estoy viendo?');
  });

  it('sends only the last 15 bubbles and the catalog once', async () => {
    const messages = Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turno ${index} con texto`,
    }));
    await service.ask(user, {
      question: '¿Qué fuentes tiene Arca?',
      messages,
    });
    const sent = create.mock.calls[0][0].messages;
    const catalogBlocks = sent.filter((message) =>
      message.content.includes(CATALOG_BLOCK_MARKER),
    );
    expect(catalogBlocks).toHaveLength(1);
    expect(sent.some((message) => message.content.includes('turno 0'))).toBe(
      false,
    );
    expect(sent.some((message) => message.content.includes('turno 1'))).toBe(
      true,
    );
    expect(sent.at(-1)?.content).toBe('¿Qué fuentes tiene Arca?');
    expect(sent.at(-1)?.content).not.toContain(CATALOG_BLOCK_MARKER);
  });

  it('does not fill a profile when the public search has no results', async () => {
    webSearch.search.mockResolvedValue({ configured: false, results: [] });
    const result = await service.ask(user, {
      question: 'Deja el borrador del perfil',
      draftTarget: 'profile',
      profileSeed: { companyName: 'Acme' },
    });
    expect(result.draft).toBeNull();
    expect(result.answer).toMatch(/no encontré/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('drafts a profile only from the search results and the written name', async () => {
    webSearch.search.mockResolvedValue({
      configured: true,
      results: [
        {
          title: 'Acme Bebidas',
          url: 'https://acme.example',
          snippet: 'Vende refrescos y botanas',
        },
      ],
    });
    create.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Dejé un borrador en el perfil.',
              draft: {
                target: 'profile',
                profile: {
                  name: 'Otra empresa',
                  keywords: ['refrescos', 'memoria fiscal'],
                  categories: ['salud'],
                  products: ['botanas'],
                },
                source: { keywordsGuide: ['no'] },
              },
            }),
          },
        },
      ],
    });
    const result = await service.ask(user, {
      question: 'Deja el borrador del perfil',
      draftTarget: 'profile',
      profileSeed: {
        companyName: 'Acme',
        description: 'La que escribió',
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.draft).toEqual({
      target: 'profile',
      profile: {
        name: 'Acme',
        description: 'La que escribió',
        keywords: ['refrescos'],
        products: ['botanas'],
      },
    });
    const sent = create.mock.calls[0][0].messages;
    const evidence = sent.filter((message) =>
      message.content.includes('Vende refrescos'),
    );
    expect(evidence).toHaveLength(1);
    expect(
      sent.filter((message) => message.content.includes(CATALOG_BLOCK_MARKER)),
    ).toHaveLength(1);
  });

  it('fetches the source URL once and does not keep fields outside the two lists', async () => {
    fetchPageMock.mockResolvedValue({
      url: 'https://ejemplo.gob.mx/gaceta',
      finalUrl: 'https://ejemplo.gob.mx/gaceta',
      statusCode: 200,
      contentType: 'text/html',
      body: Buffer.from(
        '<html><body><h1>Norma sanitaria de bebidas</h1><p>El etiquetado de alimentos queda en esta gaceta sanitaria para consulta publica de la autoridad.</p></body></html>',
      ),
      fetchedAt: '2026-10-12T00:00:00.000Z',
    });
    create.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Dejé palabras en el alta.',
              draft: {
                target: 'source',
                source: {
                  name: 'Gaceta',
                  keywordsGuide: ['etiquetado', 'youtube'],
                  searchFocus: ['norma sanitaria de bebidas'],
                },
              },
            }),
          },
        },
      ],
    });
    const result = await service.ask(user, {
      question: 'Sugiere palabras guía',
      draftTarget: 'source',
      sourceUrl: 'https://ejemplo.gob.mx/gaceta',
    });
    expect(fetchPageMock).toHaveBeenCalledTimes(1);
    expect(fetchPageMock).toHaveBeenCalledWith('https://ejemplo.gob.mx/gaceta');
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(result.draft).toEqual({
      target: 'source',
      source: {
        keywordsGuide: ['etiquetado'],
        searchFocus: ['norma sanitaria de bebidas'],
      },
    });
  });

  it('does not draft guide words from a PDF or a failed fetch', async () => {
    fetchPageMock.mockResolvedValue({
      url: 'https://ejemplo.gob.mx/a.pdf',
      finalUrl: 'https://ejemplo.gob.mx/a.pdf',
      statusCode: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF'),
      fetchedAt: '2026-10-12T00:00:00.000Z',
    });
    const pdf = await service.ask(user, {
      question: 'Sugiere palabras guía',
      draftTarget: 'source',
      sourceUrl: 'https://ejemplo.gob.mx/a.pdf',
    });
    expect(pdf.draft).toBeNull();
    expect(create).not.toHaveBeenCalled();

    fetchPageMock.mockRejectedValue(new Error('timeout'));
    const failed = await service.ask(user, {
      question: 'Sugiere palabras guía',
      draftTarget: 'source',
      sourceUrl: 'https://ejemplo.gob.mx/caida',
    });
    expect(failed.draft).toBeNull();
    expect(failed.answer).toMatch(/no pude leer/i);
    expect(create).not.toHaveBeenCalled();
  });
});
