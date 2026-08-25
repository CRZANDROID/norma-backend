import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DocumentProcessingStatus } from '../src/database/prisma-client';
import { PrismaService } from '../src/database/prisma.service';
import { DocumentPipelineService } from '../src/jobs/document-pipeline.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

const FIXTURE_HTML = `<!doctype html>
<html>
  <head><style>body{color:red}</style><script>alert('x')</script></head>
  <body>
    <nav>Menú</nav>
    <article>
      <h1>Diario Oficial de la Federación</h1>
      <p>Decreto por el que se reforman y adicionan diversas disposiciones en materia de comercio exterior, etiquetado y vigilancia sanitaria para el piloto NORMA.</p>
    </article>
  </body>
</html>
`;

describe('Documents (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let analystToken: string;
  const suffix = Date.now();
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCredentials())
      .expect(201);
    adminToken = login.body.accessToken as string;

    const analystEmail = `analyst.docs.${suffix}@norma.local`;
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: analystEmail,
        name: 'Analyst Docs',
        password: 'Password123!',
        role: 'ANALYST',
      })
      .expect(201);
    const analystLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: analystEmail, password: 'Password123!' })
      .expect(201);
    analystToken = analystLogin.body.accessToken as string;
  });

  afterAll(async () => {
    const prisma = app?.get(PrismaService);
    if (prisma && createdIds.length) {
      await prisma.document.deleteMany({
        where: { canonicalDocumentId: { in: createdIds } },
      });
      await prisma.document.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app?.close();
  });

  it('rejects unauthenticated list', async () => {
    await request(app.getHttpServer()).get('/documents').expect(401);
  });

  it('rejects unauthenticated progress', async () => {
    await request(app.getHttpServer()).get('/documents/progress').expect(401);
  });

  it('GET /documents/progress returns one executive row per source', async () => {
    const res = await request(app.getHttpServer())
      .get('/documents/progress')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(res.body.sources)).toBe(true);
    expect(res.body.sources.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body.sources) {
      expect(typeof row.sourceName).toBe('string');
      expect(typeof row.status).toBe('string');
      expect(typeof row.label).toBe('string');
      expect(row).not.toHaveProperty('contentHash');
      expect(row).not.toHaveProperty('canonicalDocumentId');
    }
  });

  it('GET /documents lists registro documental for ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /documents is available to ANALYST', async () => {
    await request(app.getHttpServer())
      .get('/documents?pilotOnly=true&limit=8')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);
  });

  it('GET /documents/:id returns 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .get('/documents/ckdoesnotexist000000000001')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('extracts a fixture HTML to READY_FOR_AI and dedups the same text', async () => {
    const prisma = app.get(PrismaService);
    const pipeline = app.get(DocumentPipelineService);
    const storage = app.get(StorageService);

    const source = await prisma.source.findUnique({ where: { code: 'dof' } });
    expect(source).toBeTruthy();

    const buffer = Buffer.from(FIXTURE_HTML);
    const firstPath = `raw/dof/e2e/${suffix}/page.html`;
    const dupPath = `raw/dof/e2e/${suffix}-dup/page.html`;

    const firstUpload = await storage.putObject({
      path: firstPath,
      buffer,
      contentType: 'text/html',
    });
    const dupUpload = await storage.putObject({
      path: dupPath,
      buffer,
      contentType: 'text/html',
    });

    const first = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: firstUpload.bucket,
        path: firstUpload.path,
        filename: 'page.html',
        mimeType: 'text/html',
        sizeBytes: buffer.length,
        processingStatus: DocumentProcessingStatus.RECEIVED,
        metadata: {
          kind: 'raw-crawl',
          sourceCode: 'dof',
          url: 'https://www.dof.gob.mx/',
        },
      },
    });
    createdIds.push(first.id);

    const extracted = await pipeline.extract(first.id);
    expect(extracted.processingStatus).toBe(DocumentProcessingStatus.EXTRACTED);

    const ready = await pipeline.normalizeDedup(first.id);
    expect(ready.processingStatus).toBe(DocumentProcessingStatus.READY_FOR_AI);
    expect(ready.contentHash).toHaveLength(64);

    const detail = await request(app.getHttpServer())
      .get(`/documents/${first.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.extractedText).toContain('Diario Oficial');
    expect(detail.body.extractedText).not.toContain('alert');
    expect(detail.body.processingStatus).toBe('READY_FOR_AI');
    expect(detail.body.html).toBeUndefined();

    const dup = await prisma.document.create({
      data: {
        sourceId: source!.id,
        bucket: dupUpload.bucket,
        path: dupUpload.path,
        filename: 'page.html',
        mimeType: 'text/html',
        sizeBytes: buffer.length,
        processingStatus: DocumentProcessingStatus.RECEIVED,
        metadata: { kind: 'raw-crawl', sourceCode: 'dof' },
      },
    });
    createdIds.push(dup.id);

    await pipeline.extract(dup.id);
    const deduped = await pipeline.normalizeDedup(dup.id);
    expect(deduped.processingStatus).toBe(DocumentProcessingStatus.DEDUPED);
    expect(deduped.canonicalDocumentId).toBe(first.id);

    const stillThere = await prisma.document.findMany({
      where: { id: { in: [first.id, dup.id] } },
    });
    expect(stillThere).toHaveLength(2);
  });
});
