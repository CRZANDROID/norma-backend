import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('Admin CRUD smoke (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  const suffix = Date.now();
  const clientSlug = `e2e-client-${suffix}`;
  const sourceCode = `e2e-src-${suffix}`;

  let clientId: string;
  let sourceId: string;
  let profileId: string;

  beforeAll(async () => {
    app = await createE2eApp();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCredentials())
      .expect(201);

    adminToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    if (app && adminToken && clientId) {
      await request(app.getHttpServer())
        .patch(`/clients/${clientId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (app && adminToken && sourceId) {
      await request(app.getHttpServer())
        .patch(`/sources/${sourceId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await app?.close();
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('lists seed sources', async () => {
    const res = await request(app.getHttpServer())
      .get('/sources')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('creates a source with no clients', async () => {
    const res = await request(app.getHttpServer())
      .post('/sources')
      .set(auth())
      .send({
        name: `Fuente E2E ${suffix}`,
        code: sourceCode,
        type: 'MEDIA',
        url: 'https://example.com/e2e',
      })
      .expect(201);

    sourceId = res.body.id as string;
    expect(res.body).toMatchObject({
      code: sourceCode,
      type: 'MEDIA',
      status: 'ACTIVE',
    });
    expect(res.body.clients).toEqual([]);
  });

  it('creates a client linked to that source', async () => {
    const res = await request(app.getHttpServer())
      .post('/clients')
      .set(auth())
      .send({
        name: `Cliente E2E ${suffix}`,
        slug: clientSlug,
        email: `e2e-${suffix}@example.com`,
        sourceIds: [sourceId],
      })
      .expect(201);

    clientId = res.body.id as string;
    expect(res.body.slug).toBe(clientSlug);
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].id).toBe(sourceId);
  });

  it('filters sources by clientId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/sources?clientId=${clientId}`)
      .set(auth())
      .expect(200);

    expect(res.body.some((s: { id: string }) => s.id === sourceId)).toBe(true);
  });

  it('creates a regulatory profile for the client', async () => {
    const res = await request(app.getHttpServer())
      .post(`/clients/${clientId}/profiles`)
      .set(auth())
      .send({
        name: `Perfil E2E ${suffix}`,
        keywords: ['etiquetado'],
        categories: ['salud'],
      })
      .expect(201);

    profileId = res.body.id as string;
    expect(profileId).toBeTruthy();
  });

  it('updates client source links (replace set)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set(auth())
      .send({ sourceIds: [] })
      .expect(200);

    expect(res.body.sources).toEqual([]);
  });

  it('gets client detail with profiles', async () => {
    const res = await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set(auth())
      .expect(200);

    expect(res.body.profiles.some((p: { id: string }) => p.id === profileId)).toBe(
      true,
    );
  });

  it('rejects unknown fields with 400', async () => {
    await request(app.getHttpServer())
      .post('/clients')
      .set(auth())
      .send({
        name: 'Bad',
        slug: `bad-${suffix}`,
        unexpected: true,
      })
      .expect(400);
  });
});
