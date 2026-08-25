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
    expect(res.body.queue).toBe('source.crawl');
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
});
