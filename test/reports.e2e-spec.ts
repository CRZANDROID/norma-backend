import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  DocumentProcessingStatus,
  EntityStatus,
  ImpactLevel,
  ReportStatus,
} from '../src/database/prisma-client';
import { PrismaService } from '../src/database/prisma.service';
import { applySentNormReopen } from '../src/jobs/reopen-sent-norm';
import { zonedDayRange } from '../src/jobs/schedule-window';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

jest.setTimeout(60_000);

const RANGE_OK = '2001-03-14';
const RANGE_CLASSIFYING = '2001-03-15';

describe('Reports generate (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  const suffix = Date.now();
  const documentIds: string[] = [];
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
      if (documentIds.length) {
        await prisma.finding.deleteMany({
          where: { documentId: { in: documentIds } },
        });
        await prisma.document.deleteMany({
          where: { id: { in: documentIds } },
        });
      }
    }
    if (app) {
      await Promise.race([
        app.close(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  }, 15_000);

  it('POST /reports is 401 without token and 400 without clientId', async () => {
    await request(app.getHttpServer()).post('/reports').send({}).expect(401);
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('POST /reports is 409 while the day is classifying', async () => {
    const prisma = app.get(PrismaService);
    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    expect(source).toBeTruthy();
    expect(arca).toBeTruthy();
    const at = midday(RANGE_CLASSIFYING);
    const doc = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: 'e2e',
        path: `raw/dof/e2e/${suffix}/reports-classifying.html`,
        filename: 'page.html',
        mimeType: 'text/html',
        processingStatus: DocumentProcessingStatus.READY_FOR_AI,
        extractedText: 'Documento aún en análisis.',
        createdAt: at,
      },
    });
    documentIds.push(doc.id);

    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: RANGE_CLASSIFYING,
        dateTo: RANGE_CLASSIFYING,
      })
      .expect(409);
    expect(res.body.message).toMatch(/análisis/i);
  });

  it('POST /reports keeps GREEN and excluded out; burned SENT findings stay out', async () => {
    const prisma = app.get(PrismaService);
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    expect(arca).toBeTruthy();

    const red = await seedFinding(ImpactLevel.RED, 'red');
    const orange = await seedFinding(ImpactLevel.ORANGE, 'orange');
    const yellow = await seedFinding(ImpactLevel.YELLOW, 'yellow');
    const green = await seedFinding(ImpactLevel.GREEN, 'green');
    await prisma.finding.update({
      where: { id: orange.finding.id },
      data: { excludedFromNextReport: true },
    });

    const burned = await seedFinding(ImpactLevel.RED, 'burned');
    const sent = await prisma.report.create({
      data: {
        clientId: arca!.id,
        dateFrom: RANGE_OK,
        dateTo: RANGE_OK,
        status: ReportStatus.SENT,
        generatedByUserId: (
          await prisma.user.findUnique({
            where: { email: adminCredentials().email },
          })
        )!.id,
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

    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: RANGE_OK,
        dateTo: RANGE_OK,
      })
      .expect(201);

    reportIds.push(res.body.id);
    expect(res.body.status).toBe('draft');
    expect(res.body.client.slug).toBe('arca-continental');
    expect(res.body.dateFrom).toBe(RANGE_OK);
    expect(res.body.dateTo).toBe(RANGE_OK);
    expect(res.body.fileUrl).toBe(`/reports/${res.body.id}/file`);
    expect(res.body.findingCount).toBe(2);
    expect(res.body.counts).toEqual({ red: 1, orange: 0, yellow: 1 });
    const ids = (res.body.findings as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toEqual([red.finding.id, yellow.finding.id]);
    expect(ids).not.toContain(orange.finding.id);
    expect(ids).not.toContain(green.finding.id);
    expect(ids).not.toContain(burned.finding.id);
    expect(res.body.findings[0].impact).toBe('RED');
    expect(res.body.findings[0].justification).toContain('red');
    expect(res.body.findings[1].impact).toBe('YELLOW');

    const listed = await request(app.getHttpServer())
      .get(`/reports?clientId=${arca!.id}&status=draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === res.body.id)).toBe(
      true,
    );

    const detail = await request(app.getHttpServer())
      .get(`/reports/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.findings).toHaveLength(2);
    expect(detail.body.fileUrl).toBe(`/reports/${res.body.id}/file`);

    await request(app.getHttpServer())
      .get(`/reports/${res.body.id}/file`)
      .expect(401);

    const pdf = await request(app.getHttpServer())
      .get(`/reports/${res.body.id}/file`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((incoming, callback) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(pdf.headers['content-disposition']).toMatch(/inline/);
    expect(pdf.headers['content-disposition']).toMatch(
      /NORMA-arca-continental-2001-03-14\.pdf/,
    );
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const downloaded = await request(app.getHttpServer())
      .get(`/reports/${res.body.id}/file?download=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((incoming, callback) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.headers['content-disposition']).toMatch(/attachment/);

    await request(app.getHttpServer())
      .post(`/reports/${res.body.id}/regenerate`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/findings/${yellow.finding.id}/exclude`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const regenerated = await request(app.getHttpServer())
      .post(`/reports/${res.body.id}/regenerate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(regenerated.body.findingCount).toBe(1);
    expect(regenerated.body.findings.map((row: { id: string }) => row.id)).toEqual([
      red.finding.id,
    ]);

    await request(app.getHttpServer())
      .post(`/reports/${sent.id}/regenerate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('POST /reports is 400 when the range has no candidates', async () => {
    const prisma = app.get(PrismaService);
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: '2001-03-16',
        dateTo: '2001-03-16',
      })
      .expect(400);
  });

  it('ANALYST without membership gets 403 on another client', async () => {
    const prisma = app.get(PrismaService);
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    const email = `analyst.reports.${suffix}@norma.local`;
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        name: 'Analyst Reports E2E',
        password: 'Password123!',
        role: 'ANALYST',
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: RANGE_OK,
        dateTo: RANGE_OK,
      })
      .expect(403);
  });

  it('POST /reports/:id/send stays draft when the Resend key is missing', async () => {
    const keys = hideMailKeys();
    try {
      const created = await generateOn('2001-03-20', 'send');
      const prisma = app.get(PrismaService);
      const arca = await prisma.client.findUnique({
        where: { slug: 'arca-continental' },
      });
      const contactIds = await activeContactIds(arca!.id);
      expect(contactIds.length).toBeGreaterThan(0);

      const none = await request(app.getHttpServer())
        .post(`/reports/${created.id}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactIds: [] })
        .expect(200);
      expect(none.body.status).toBe('draft');
      expect(none.body.email.sent).toBe(false);
      expect(none.body.email.reason).toBe('no_recipients');
      expect(none.body.email.message).toContain('contacto');

      await request(app.getHttpServer())
        .post(`/reports/${created.id}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactIds: ['no-such-contact'] })
        .expect(400);

      const sent = await request(app.getHttpServer())
        .post(`/reports/${created.id}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactIds })
        .expect(200);
      expect(sent.body.status).toBe('draft');
      expect(sent.body.email.sent).toBe(false);
      expect(sent.body.email.reason).toBe('missing_api_key');
      expect(sent.body.email.message).toContain('RESEND_API_KEY');
      expect(sent.body.email.message).toContain('borrador');

      const row = await prisma.report.findUnique({ where: { id: created.id } });
      expect(row?.status).toBe(ReportStatus.DRAFT);
      expect(row?.sentAt).toBeNull();

      const retry = await request(app.getHttpServer())
        .post(`/reports/${created.id}/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactIds })
        .expect(200);
      expect(retry.body.status).toBe('draft');

      const discarded = await request(app.getHttpServer())
        .post(`/reports/${created.id}/discard`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(discarded.body.status).toBe('discarded');
    } finally {
      restoreMailKeys(keys);
    }
  });

  it('POST /reports/:id/discard returns findings to the candidate pool', async () => {
    const prisma = app.get(PrismaService);
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    const kept = await seedFinding(ImpactLevel.RED, 'discard-kept', '2001-03-21');
    const excluded = await seedFinding(
      ImpactLevel.YELLOW,
      'discard-excluded',
      '2001-03-21',
    );
    await prisma.finding.update({
      where: { id: excluded.finding.id },
      data: { excludedFromNextReport: true },
    });
    const created = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: '2001-03-21',
        dateTo: '2001-03-21',
      })
      .expect(201);
    reportIds.push(created.body.id);
    expect(created.body.status).toBe('draft');
    expect(created.body.findings.map((row: { id: string }) => row.id)).toEqual([
      kept.finding.id,
    ]);

    const discarded = await request(app.getHttpServer())
      .post(`/reports/${created.body.id}/discard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(discarded.body.status).toBe('discarded');

    const excludedRow = await prisma.finding.findUnique({
      where: { id: excluded.finding.id },
    });
    expect(excludedRow?.excludedFromNextReport).toBe(false);

    const again = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: '2001-03-21',
        dateTo: '2001-03-21',
      })
      .expect(201);
    reportIds.push(again.body.id);
    const ids = (again.body.findings as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([kept.finding.id, excluded.finding.id]));
  });

  it('autoSend keeps the draft when Resend does not accept the mail', async () => {
    const prisma = app.get(PrismaService);
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    const keys = hideMailKeys();
    await prisma.clientDeliveryConfig.update({
      where: { clientId: arca!.id },
      data: { autoSend: true },
    });
    try {
      const contactIds = await activeContactIds(arca!.id);
      const created = await generateOn('2001-03-22', 'autosend', contactIds);
      expect(created.status).toBe('draft');
      expect(created.email.sent).toBe(false);
      expect(created.email.message).toContain('RESEND_API_KEY');
      expect(created.email.message).toContain('borrador');
    } finally {
      await prisma.clientDeliveryConfig.update({
        where: { clientId: arca!.id },
        data: { autoSend: false },
      });
      restoreMailKeys(keys);
    }
  });

  it('reopens a sent norm when a new crawl hash differs', async () => {
    const prisma = app.get(PrismaService);
    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    const url = `https://www.dof.gob.mx/notas/reopen-${suffix}`;
    const day = '2001-03-23';
    const previous = await seedFinding(ImpactLevel.RED, 'reopen-old', day, {
      url,
      contentHash: 'a'.repeat(64),
      extractedText: 'El decreto original fija el etiquetado frontal de bebidas.',
    });
    const admin = await prisma.user.findUnique({
      where: { email: adminCredentials().email },
    });
    const sent = await prisma.report.create({
      data: {
        clientId: arca!.id,
        dateFrom: day,
        dateTo: day,
        status: ReportStatus.SENT,
        generatedByUserId: admin!.id,
        sentAt: new Date('2026-10-01T18:00:00.000Z'),
        items: {
          create: {
            findingId: previous.finding.id,
            impact: ImpactLevel.RED,
            sortOrder: 0,
          },
        },
      },
    });
    reportIds.push(sent.id);

    const next = await seedFinding(ImpactLevel.ORANGE, 'reopen-new', day, {
      url: `${url}/`,
      contentHash: 'b'.repeat(64),
      extractedText:
        'El decreto original fija el etiquetado frontal de bebidas. La reforma adelanta la vigencia al primero de marzo.',
    });
    const note = await applySentNormReopen(prisma, {
      documentId: next.doc.id,
      clientId: arca!.id,
      sourceId: source!.id,
      contentHash: 'b'.repeat(64),
      metadata: { url: `${url}/` },
      extractedText: next.doc.extractedText,
    });
    expect(note).toContain('otro contenido');
    expect(note).toContain('vigencia');

    const created = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId: arca!.id, dateFrom: day, dateTo: day })
      .expect(201);
    reportIds.push(created.body.id);
    const row = (created.body.findings as Array<{ id: string; changeNote: string | null }>).find(
      (item) => item.id === next.finding.id,
    );
    expect(row?.changeNote).toContain('otro contenido');
    expect(
      (created.body.findings as Array<{ id: string }>).map((item) => item.id),
    ).not.toContain(previous.finding.id);
  });

  async function activeContactIds(clientId: string): Promise<string[]> {
    const prisma = app.get(PrismaService);
    const rows = await prisma.clientContact.findMany({
      where: { clientId, status: EntityStatus.ACTIVE },
      select: { id: true, email: true },
    });
    return rows.filter((row) => !!row.email?.trim()).map((row) => row.id);
  }

  async function generateOn(
    day: string,
    label: string,
    contactIds?: string[],
  ) {
    const prisma = app.get(PrismaService);
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    await seedFinding(ImpactLevel.RED, label, day);
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: arca!.id,
        dateFrom: day,
        dateTo: day,
        ...(contactIds ? { contactIds } : {}),
      })
      .expect(201);
    reportIds.push(res.body.id);
    return res.body as {
      id: string;
      status: string;
      email: { sent: boolean; message: string; reason: string };
    };
  }

  async function seedFinding(
    impact: ImpactLevel,
    label: string,
    day = RANGE_OK,
    extra?: { url?: string; contentHash?: string; extractedText?: string },
  ) {
    const prisma = app.get(PrismaService);
    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    const at = midday(day);
    const doc = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: 'e2e',
        path: `raw/dof/e2e/${suffix}/reports-${label}.html`,
        filename: 'page.html',
        mimeType: 'text/html',
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        contentHash: extra?.contentHash ?? null,
        extractedText: extra?.extractedText ?? `Texto ${label}`,
        metadata: {
          kind: 'raw-crawl',
          url: extra?.url ?? 'https://www.dof.gob.mx/nota_detalle.php?codigo=e2e',
        },
        createdAt: at,
      },
    });
    documentIds.push(doc.id);
    const finding = await prisma.finding.create({
      data: {
        title: `Hallazgo ${label}`,
        justification: `Briefing ${label} para el informe.`,
        impact,
        clientId: arca!.id,
        sourceId: source!.id,
        documentId: doc.id,
        createdAt: at,
      },
    });
    findingIds.push(finding.id);
    return { doc, finding };
  }
});

function midday(ymd: string): Date {
  return new Date(zonedDayRange(ymd).start.getTime() + 12 * 3600 * 1000);
}

function hideMailKeys(): { key?: string; from?: string } {
  const saved = {
    key: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM,
  };
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  return saved;
}

function restoreMailKeys(saved: { key?: string; from?: string }) {
  if (saved.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.key;
  if (saved.from === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = saved.from;
}
