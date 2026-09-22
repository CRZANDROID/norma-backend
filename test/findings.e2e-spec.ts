import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DocumentProcessingStatus, ImpactLevel, ReportStatus } from '../src/database/prisma-client';
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
  const reportIds: string[] = [];

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
      if (reportIds.length) {
        await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
      }
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
    expect(res.body.summary.total).toBe(res.body.sources.length);
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
      .get('/findings?limit=20')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.dateFrom).toBeNull();
    expect(res.body.dateTo).toBeNull();
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.totalPages).toBe('number');
    expect(res.body.counts).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        red: expect.any(Number),
        orange: expect.any(Number),
        yellow: expect.any(Number),
        green: expect.any(Number),
        included: expect.any(Number),
        excluded: expect.any(Number),
        sent: expect.any(Number),
      }),
    );
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(20);
    if (res.body.items[0]) {
      expect(typeof res.body.items[0].excludedFromNextReport).toBe('boolean');
    }
  });

  it('GET /findings rejects inverted date range', async () => {
    await request(app.getHttpServer())
      .get('/findings?dateFrom=2026-09-07&dateTo=2026-09-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
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

    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const finding = list.body.items.find(
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
    expect(byCode.body.items.some((row: { id: string }) => row.id === finding.id)).toBe(
      true,
    );

    const otherCode = await request(app.getHttpServer())
      .get(`/findings?sourceCode=diputados-gaceta&documentId=${doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(otherCode.body.items).toEqual([]);

    const detail = await request(app.getHttpServer())
      .get(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.justification).toContain('Arca Continental');
    expect(detail.body.document?.url).toBe('https://www.dof.gob.mx/');
  });

  it('PATCH /findings/:id updates title and justification, leaving impact as is', async () => {
    const { finding } = await seedVcgaFinding(ImpactLevel.YELLOW, 'patch');
    await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .expect(401);

    const res = await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Título editado por VCGA',
        justification: '## Hecho\n\nBriefing editado a mano.',
      })
      .expect(200);
    expect(res.body.title).toBe('Título editado por VCGA');
    expect(res.body.justification).toContain('Briefing editado a mano');
    expect(res.body.impact).toBe('YELLOW');
    expect(res.body.excludedFromNextReport).toBe(false);

    await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('PATCH /findings/:id moves the semáforo by hand; GREEN clears the exclusion', async () => {
    const { finding } = await seedVcgaFinding(ImpactLevel.YELLOW, 'impact');
    const excluded = await request(app.getHttpServer())
      .post(`/findings/${finding.id}/exclude`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(excluded.body.excludedFromNextReport).toBe(true);

    const raised = await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ impact: 'RED' })
      .expect(200);
    expect(raised.body.impact).toBe('RED');
    expect(raised.body.excludedFromNextReport).toBe(true);

    const greened = await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ impact: 'GREEN' })
      .expect(200);
    expect(greened.body.impact).toBe('GREEN');
    expect(greened.body.excludedFromNextReport).toBe(false);

    await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ impact: 'PURPLE' })
      .expect(400);
  });

  it('POST exclude rejects GREEN and toggles YELLOW via include', async () => {
    const green = await seedVcgaFinding(ImpactLevel.GREEN, 'green');
    await request(app.getHttpServer())
      .post(`/findings/${green.finding.id}/exclude`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const yellow = await seedVcgaFinding(ImpactLevel.YELLOW, 'yellow');
    const excluded = await request(app.getHttpServer())
      .post(`/findings/${yellow.finding.id}/exclude`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(excluded.body.excludedFromNextReport).toBe(true);
    expect(excluded.body.impact).toBe('YELLOW');

    const listed = await request(app.getHttpServer())
      .get(`/findings?excluded=true&documentId=${yellow.doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      listed.body.items.some((row: { id: string }) => row.id === yellow.finding.id),
    ).toBe(true);
    expect(listed.body.counts.total).toBeGreaterThanOrEqual(listed.body.total);

    const included = await request(app.getHttpServer())
      .post(`/findings/${yellow.finding.id}/include`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(included.body.excludedFromNextReport).toBe(false);
  });

  it('GET /findings lote filters included / excluded / sent like POST /reports', async () => {
    const prisma = app.get(PrismaService);
    const included = await seedVcgaFinding(ImpactLevel.YELLOW, 'lote-in');
    const green = await seedVcgaFinding(ImpactLevel.GREEN, 'lote-green');
    const parked = await seedVcgaFinding(ImpactLevel.ORANGE, 'lote-ex');
    await prisma.finding.update({
      where: { id: parked.finding.id },
      data: { excludedFromNextReport: true },
    });
    const burned = await seedVcgaFinding(ImpactLevel.RED, 'lote-sent');
    const admin = await prisma.user.findUnique({
      where: { email: adminCredentials().email },
    });
    expect(admin).toBeTruthy();
    const sent = await prisma.report.create({
      data: {
        clientId: burned.finding.clientId,
        status: ReportStatus.SENT,
        generatedByUserId: admin!.id,
        sentAt: new Date(),
        items: {
          create: {
            findingId: burned.finding.id,
            impact: ImpactLevel.RED,
            sortOrder: 0,
          },
        },
      },
    });
    reportIds.push(sent.id);

    await request(app.getHttpServer())
      .get(`/findings?lote=incluidos&excluded=true&documentId=${included.doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/findings?lote=nope')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const inLote = await request(app.getHttpServer())
      .get(`/findings?lote=incluidos&documentId=${included.doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inLote.body.items.map((row: { id: string }) => row.id)).toEqual([
      included.finding.id,
    ]);
    expect(inLote.body.counts).toEqual(
      expect.objectContaining({
        included: 1,
        excluded: 0,
        sent: 0,
        yellow: 1,
        total: 1,
      }),
    );

    const greenLote = await request(app.getHttpServer())
      .get(`/findings?lote=incluidos&documentId=${green.doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(greenLote.body.items).toEqual([]);
    expect(greenLote.body.counts.included).toBe(0);
    expect(greenLote.body.counts.green).toBe(1);

    const excludedLote = await request(app.getHttpServer())
      .get(`/findings?lote=excluidos&documentId=${parked.doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(excludedLote.body.items.map((row: { id: string }) => row.id)).toEqual([
      parked.finding.id,
    ]);
    expect(excludedLote.body.counts.excluded).toBe(1);
    expect(excludedLote.body.counts.included).toBe(0);

    const sentLote = await request(app.getHttpServer())
      .get(`/findings?lote=enviados&documentId=${burned.doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(sentLote.body.items.map((row: { id: string }) => row.id)).toEqual([
      burned.finding.id,
    ]);
    expect(sentLote.body.counts.sent).toBe(1);
    expect(sentLote.body.counts.included).toBe(0);
  });

  it('ANALYST without membership gets 404 on another client finding', async () => {
    const { finding } = await seedVcgaFinding(ImpactLevel.ORANGE, 'analyst404');
    const email = `analyst.findings.${suffix}@norma.local`;
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        name: 'Analyst Findings E2E',
        password: 'Password123!',
        role: 'ANALYST',
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/findings/${finding.id}`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ title: 'No debe pasar' })
      .expect(404);
  });

  it('POST /findings/:id/rewrite returns 503 without OpenAI', async () => {
    if (process.env.OPENAI_API_KEY?.trim()) {
      return;
    }
    const { finding } = await seedVcgaFinding(ImpactLevel.YELLOW, 'rewrite');
    await request(app.getHttpServer())
      .post(`/findings/${finding.id}/rewrite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ prompt: 'Acorta el briefing.' })
      .expect(503);
  });

  async function seedVcgaFinding(impact: ImpactLevel, label: string) {
    const prisma = app.get(PrismaService);
    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    expect(source).toBeTruthy();
    expect(arca).toBeTruthy();
    const doc = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: 'e2e',
        path: `raw/dof/e2e/${suffix}/s8-${label}.html`,
        filename: 'page.html',
        mimeType: 'text/html',
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        extractedText: FIXTURE_TEXT,
      },
    });
    createdIds.push(doc.id);
    const finding = await prisma.finding.create({
      data: {
        title: `Hallazgo ${label}`,
        justification: `Briefing ${label} para el loop VCGA.`,
        impact,
        clientId: arca!.id,
        sourceId: source!.id,
        documentId: doc.id,
      },
    });
    findingIds.push(finding.id);
    return { doc, finding };
  }
});
