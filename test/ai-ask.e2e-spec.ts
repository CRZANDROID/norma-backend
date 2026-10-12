import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CATALOG_BLOCK_MARKER } from '../src/modules/ai/ai.constants';
import { OpenAiClientService } from '../src/modules/ai/openai-client.service';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('AI catalog ask (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCredentials())
      .expect(201);
    adminToken = login.body.accessToken as string;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated ask', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .send({ question: '¿Qué fuentes tiene Arca?' })
      .expect(401);
  });

  it('rejects empty question with 400', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: '' })
      .expect(400);
  });

  it('rejects a history role that is not user or assistant', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        question: '¿Qué clientes tengo?',
        messages: [{ role: 'system', content: 'no' }],
      })
      .expect(400);
  });

  it('rejects a history bubble that is not text', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        question: '¿Qué clientes tengo?',
        messages: [{ role: 'user', content: 12 }],
      })
      .expect(400);
  });

  it('rejects a profile draft without the company name', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        question: 'Deja el borrador del perfil',
        draftTarget: 'profile',
      })
      .expect(400);
  });

  it('GET /ai/status does not call the model', async () => {
    const res = await request(app.getHttpServer())
      .get('/ai/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(typeof res.body.configured).toBe('boolean');
    if (res.body.configured) {
      expect(res.body.model).toBeTruthy();
    } else {
      expect(res.body.model).toBeNull();
    }
  });

  it('POST /ai/ask returns 503 when OpenAI is not configured', async () => {
    if (process.env.OPENAI_API_KEY?.trim()) {
      return;
    }

    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: '¿Qué fuentes tiene Arca Continental?' })
      .expect(503);
  });

  it('trims history to 15 and nulls a draft when no form asked for one', async () => {
    const create = mockModel(
      app,
      JSON.stringify({
        answer: 'Consta en tus registros.',
        draft: {
          target: 'profile',
          profile: { name: 'Inventada', keywords: ['x'] },
        },
      }),
    );
    const messages = Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turno ${index} con texto`,
    }));

    const res = await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: '¿Qué clientes tengo activos?', messages })
      .expect(200);

    expect(res.body.draft).toBeNull();
    expect(res.body.answer).toBe('Consta en tus registros.');
    expect(res.body.catalog).toEqual(
      expect.objectContaining({
        clientCount: expect.any(Number),
        profileCount: expect.any(Number),
        sourceCount: expect.any(Number),
      }),
    );

    const sent = create.mock.calls[0][0].messages as Array<{
      role: string;
      content: string;
    }>;
    expect(
      sent.filter((message) => message.content.includes(CATALOG_BLOCK_MARKER)),
    ).toHaveLength(1);
    expect(sent.some((message) => message.content.includes('turno 0'))).toBe(
      false,
    );
    expect(sent.some((message) => message.content.includes('turno 1'))).toBe(
      true,
    );
    expect(sent.at(-1)?.content).toBe('¿Qué clientes tengo activos?');
  });

  it('does not put another analyst client in this analyst catalog', async () => {
    const suffix = Date.now();
    const password = 'Password123!';
    const ownName = `000 propio ${suffix}`;
    const foreignName = `000 ajeno ${suffix}`;
    const sourceName = `000 fuente suelta ${suffix}`;

    const ownToken = await analystToken(app, adminToken, suffix, 'a', password);
    const foreignToken = await analystToken(
      app,
      adminToken,
      suffix,
      'b',
      password,
    );

    const ownClient = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${ownToken}`)
      .send({ name: ownName, slug: `propio-${suffix}` })
      .expect(201);
    await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ name: foreignName, slug: `ajeno-${suffix}` })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/clients/${ownClient.body.id as string}/profiles`)
      .set('Authorization', `Bearer ${ownToken}`)
      .send({
        name: 'Bebidas',
        description: `Ficha visible ${suffix}`,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: sourceName,
        code: `suelta-${suffix}`,
        category: 'OFFICIAL',
        platform: 'WEB',
        url: `https://example.com/suelta-${suffix}`,
      })
      .expect(201);

    const create = mockModel(
      app,
      JSON.stringify({ answer: 'Listo.', draft: null }),
    );
    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${ownToken}`)
      .send({ question: '¿Qué clientes tengo activos?' })
      .expect(200);

    const sent = create.mock.calls[0][0].messages as Array<{ content: string }>;
    const catalogMessage = sent.find((message) =>
      message.content.includes(CATALOG_BLOCK_MARKER),
    );
    expect(catalogMessage).toBeTruthy();
    const catalog = JSON.parse(
      catalogMessage!.content.slice(catalogMessage!.content.indexOf('\n') + 1),
    ) as {
      clientes: Array<{
        nombre: string;
        perfiles: Array<{ descripcion: string }>;
      }>;
      fuentes: Array<{ nombre: string }>;
    };
    expect(catalog.clientes.map((client) => client.nombre)).toContain(ownName);
    expect(catalog.clientes.map((client) => client.nombre)).not.toContain(
      foreignName,
    );
    expect(JSON.stringify(catalog)).not.toContain(foreignName);
    expect(catalog.fuentes.map((source) => source.nombre)).toContain(
      sourceName,
    );
    expect(
      catalog.clientes.find((client) => client.nombre === ownName)?.perfiles[0]
        ?.descripcion,
    ).toBe(`Ficha visible ${suffix}`);
  });
});

function mockModel(app: INestApplication, content: string) {
  const openai = app.get(OpenAiClientService);
  const create = jest.fn().mockResolvedValue({
    model: 'gpt-4o-mini',
    choices: [{ message: { content } }],
  });
  jest.spyOn(openai, 'ensureClient').mockReturnValue({
    chat: { completions: { create } },
  } as never);
  jest.spyOn(openai, 'getModel').mockReturnValue('gpt-4o-mini');
  return create;
}

async function analystToken(
  app: INestApplication,
  adminToken: string,
  suffix: number,
  slot: string,
  password: string,
) {
  const email = `analyst.chat.${slot}.${suffix}@norma.local`;
  await request(app.getHttpServer())
    .post('/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email,
      name: `Analyst ${slot}`,
      password,
      role: 'ANALYST',
    })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(201);
  return login.body.accessToken as string;
}
