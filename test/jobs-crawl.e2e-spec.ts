import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('Jobs crawl (e2e)', () => {
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

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated crawl', async () => {
    await request(app.getHttpServer())
      .post('/jobs/crawl')
      .send({ sourceCode: 'dof' })
      .expect(401);
  });

  it('GET /jobs/status does not require Redis to be up', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(typeof res.body.configured).toBe('boolean');
    expect(typeof res.body.worker).toBe('boolean');
    expect(res.body.queue).toBe('source.crawl');
    expect(res.body.consumers).toEqual(
      expect.objectContaining({
        'source.crawl': expect.any(Number),
        'document.extract': expect.any(Number),
        'document.normalize_dedup': expect.any(Number),
        'document.classify': expect.any(Number),
      }),
    );
    expect(res.body.queues).toEqual(
      expect.objectContaining({
        'source.crawl': expect.anything(),
        'document.extract': expect.anything(),
        'document.normalize_dedup': expect.anything(),
        'document.classify': expect.anything(),
      }),
    );
    for (const counts of Object.values(res.body.queues as Record<string, unknown>)) {
      if (counts === null) {
        continue;
      }
      expect(counts).toEqual(
        expect.objectContaining({
          waiting: expect.any(Number),
          active: expect.any(Number),
          delayed: expect.any(Number),
          failed: expect.any(Number),
          paused: expect.any(Number),
          stalled: expect.any(Number),
        }),
      );
    }
    expect(Array.isArray(res.body.connectors)).toBe(true);
  });

  it('GET /jobs/runs lists job_runs', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs/runs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects unauthenticated progress', async () => {
    await request(app.getHttpServer()).get('/jobs/progress').expect(401);
  });

  it('GET /jobs/progress rejects an invalid calendar date', async () => {
    await request(app.getHttpServer())
      .get('/jobs/progress?date=2026-13-99')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('GET /jobs/progress returns one executive row per source', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs/progress')
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
      expect(row).not.toHaveProperty('idempotencyKey');
      expect(row).not.toHaveProperty('storagePath');
    }
  });

  it('POST /jobs/crawl without sourceId/sourceCode is 400', async () => {
    await request(app.getHttpServer())
      .post('/jobs/crawl')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('POST /jobs/crawl returns 503 when Redis is not configured', async () => {
    const status = await request(app.getHttpServer())
      .get('/jobs/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    if (status.body.configured) {
      await request(app.getHttpServer())
        .post('/jobs/crawl')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sourceCode: 'e2e-missing-source' })
        .expect(404);
      return;
    }

    await request(app.getHttpServer())
      .post('/jobs/crawl')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceCode: 'dof' })
      .expect(503);
  });

  it('rejects unauthenticated extract and classify', async () => {
    await request(app.getHttpServer())
      .post('/jobs/extract')
      .send({ sourceCode: 'dof' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/jobs/classify')
      .send({ sourceCode: 'dof' })
      .expect(401);
    await request(app.getHttpServer()).post('/jobs/extract/all').expect(401);
    await request(app.getHttpServer()).post('/jobs/classify/all').expect(401);
  });

  it('POST /jobs/classify without source is 400', async () => {
    await request(app.getHttpServer())
      .post('/jobs/classify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('POST /jobs/classify on an ACTIVE source with no clients is 400', async () => {
    const suffix = Date.now();
    const created = await request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Fuente sin cliente ${suffix}`,
        code: `e2e-noclient-${suffix}`,
        category: 'MEDIA',
        platform: 'WEB',
        url: 'https://example.com/e2e-noclient',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/jobs/classify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceId: created.body.id })
      .expect(400);
    expect(res.body.message).toMatch(/no tiene clientes vinculados/i);

    await request(app.getHttpServer())
      .patch(`/sources/${created.body.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});
