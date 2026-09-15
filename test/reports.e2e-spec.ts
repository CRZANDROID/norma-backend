import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  DocumentProcessingStatus,
  ImpactLevel,
  ReportStatus,
} from '../src/database/prisma-client';
import { PrismaService } from '../src/database/prisma.service';
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

  async function seedFinding(impact: ImpactLevel, label: string) {
    const prisma = app.get(PrismaService);
    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    const arca = await prisma.client.findUnique({
      where: { slug: 'arca-continental' },
    });
    const at = midday(RANGE_OK);
    const doc = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: 'e2e',
        path: `raw/dof/e2e/${suffix}/reports-${label}.html`,
        filename: 'page.html',
        mimeType: 'text/html',
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        extractedText: `Texto ${label}`,
        metadata: {
          kind: 'raw-crawl',
          url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=e2e',
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
