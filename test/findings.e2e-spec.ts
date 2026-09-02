import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DocumentProcessingStatus } from '../src/database/prisma-client';
import { PrismaService } from '../src/database/prisma.service';
import { DocumentClassifyService } from '../src/jobs/document-classify.service';
import { OpenAiClientService } from '../src/modules/ai/openai-client.service';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

jest.setTimeout(30_000);

const FIXTURE_TEXT =
  'Decreto por el que se reforman disposiciones en materia de etiquetado y vigilancia sanitaria de bebidas azucaradas para el piloto NORMA Arca.';

describe('Findings classify (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  const suffix = Date.now();
  const createdIds: string[] = [];
  const findingIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCredentials())
      .expect(201);
    adminToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    const prisma = app?.get(PrismaService);
    if (prisma) {
      if (findingIds.length) {
        await prisma.finding.deleteMany({ where: { id: { in: findingIds } } });
      }
      if (createdIds.length) {
        await prisma.finding.deleteMany({
          where: { documentId: { in: createdIds } },
        });
        await prisma.document.deleteMany({ where: { id: { in: createdIds } } });
      }
    }
    if (app) {
      await Promise.race([
        app.close(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  }, 15_000);

  it('GET /findings/progress rejects unauthenticated and invalid date', async () => {
    await request(app.getHttpServer()).get('/findings/progress').expect(401);
    await request(app.getHttpServer())
      .get('/findings/progress?date=2026-13-99')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('GET /findings/progress returns one executive row per source', async () => {
    const res = await request(app.getHttpServer())
      .get('/findings/progress')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(res.body.sources)).toBe(true);
    expect(res.body.sources.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body.sources) {
      expect(typeof row.sourceName).toBe('string');
      expect(typeof row.status).toBe('string');
      expect(typeof row.label).toBe('string');
      expect(row.counts).toEqual(
        expect.objectContaining({
          red: expect.any(Number),
          orange: expect.any(Number),
          yellow: expect.any(Number),
          green: expect.any(Number),
        }),
      );
      expect(row).not.toHaveProperty('justification');
      expect(row).not.toHaveProperty('aiMeta');
      expect(row).not.toHaveProperty('headline');
      expect(row).not.toHaveProperty('impact');
      expect(row).not.toHaveProperty('detail');
    }
  });

  it('GET /findings lists for ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get('/findings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /documents/:id/classify is 401 without token', async () => {
    await request(app.getHttpServer())
      .post('/documents/ckdoesnotexist000000000001/classify')
      .expect(401);
  });

  it('POST /documents/:id/classify returns 503 without OpenAI', async () => {
    if (process.env.OPENAI_API_KEY?.trim()) {
      return;
    }
    const prisma = app.get(PrismaService);
    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    expect(source).toBeTruthy();
    const row = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: 'e2e',
        path: `raw/dof/e2e/${suffix}/classify-nookey.html`,
        filename: 'page.html',
        mimeType: 'text/html',
        processingStatus: DocumentProcessingStatus.READY_FOR_AI,
        extractedText: 'Decreto de etiquetado para bebidas.',
      },
    });
    createdIds.push(row.id);

    await request(app.getHttpServer())
      .post(`/documents/${row.id}/classify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(503);
  });

  it('classifies READY_FOR_AI for Arca with mocked OpenAI', async () => {
    const prisma = app.get(PrismaService);
    const openai = app.get(OpenAiClientService);
    const classify = app.get(DocumentClassifyService);

    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    expect(source).toBeTruthy();
    expect(arca).toBeTruthy();

    await prisma.clientSource.upsert({
      where: {
        clientId_sourceId: {
          clientId: arca!.id,
          sourceId: source!.id,
        },
      },
      create: { clientId: arca!.id, sourceId: source!.id },
      update: {},
    });

    const doc = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: 'e2e',
        path: `raw/dof/e2e/${suffix}/classify-page.html`,
        filename: 'page.html',
        mimeType: 'text/html',
        processingStatus: DocumentProcessingStatus.READY_FOR_AI,
        extractedText: FIXTURE_TEXT,
        metadata: {
          kind: 'raw-crawl',
          sourceCode: 'dof',
          url: 'https://www.dof.gob.mx/',
        },
      },
    });
    createdIds.push(doc.id);

    jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
    jest.spyOn(openai, 'getModel').mockReturnValue('gpt-4o-mini');
    jest.spyOn(openai, 'ensureClient').mockReturnValue({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            model: 'gpt-4o-mini',
            usage: {
              prompt_tokens: 12,
              completion_tokens: 40,
              total_tokens: 52,
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    relevant: true,
                    impact: 'ORANGE',
                    title: 'Etiquetado y vigilancia sanitaria',
                    justification:
                      'El decreto toca etiquetado de bebidas, alineado al perfil de Arca Continental.',
                  }),
                },
              },
            ],
          }),
        },
      },
    } as never);

    const result = await classify.classify(doc.id);
    expect(result.processingStatus).toBe(DocumentProcessingStatus.CLASSIFIED);
    expect(result.findingsUpserted).toBeGreaterThanOrEqual(1);

    const list = await request(app.getHttpServer())
      .get(`/findings?documentId=${doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const finding = list.body.find(
      (row: { client?: { slug?: string } }) =>
        row.client?.slug === 'arca-continental',
    );
    expect(finding).toBeTruthy();
    expect(finding.impact).toBe('ORANGE');
    expect(finding.title).toContain('Etiquetado');
    expect(finding.suggestedAction).toBeTruthy();
    expect(finding.source?.code).toBe('dof');
    expect(finding.source?.url).toMatch(/dof\.gob\.mx/i);
    expect(finding.document?.url).toBe('https://www.dof.gob.mx/');
    findingIds.push(finding.id);

    const byCode = await request(app.getHttpServer())
      .get(`/findings?sourceCode=dof&documentId=${doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(byCode.body.some((row: { id: string }) => row.id === finding.id)).toBe(
      true,
    );

    const otherCode = await request(app.getHttpServer())
      .get(`/findings?sourceCode=diputados-gaceta&documentId=${doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(otherCode.body).toEqual([]);

    const detail = await request(app.getHttpServer())
      .get(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.justification).toContain('Arca Continental');
    expect(detail.body.document?.url).toBe('https://www.dof.gob.mx/');
  });
});
