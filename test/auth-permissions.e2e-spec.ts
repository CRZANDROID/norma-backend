import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('Auth + permissions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let analystToken: string;
  const suffix = Date.now();
  const analystEmail = `analyst.e2e.${suffix}@norma.local`;
  const analystPassword = 'Password123!';

  beforeAll(async () => {
    app = await createE2eApp();

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCredentials())
      .expect(201);

    adminToken = adminLogin.body.accessToken as string;
    expect(adminToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: analystEmail,
        name: 'Analyst E2E',
        password: analystPassword,
        role: 'ANALYST',
      })
      .expect(201);

    const analystLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: analystEmail, password: analystPassword })
      .expect(201);

    analystToken = analystLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects invalid login body with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('rejects bad credentials with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: adminCredentials().email,
        password: 'WrongPass999!',
      })
      .expect(401);
  });

  it('returns 401 for /auth/me without token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns profile for /auth/me with admin token', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      email: adminCredentials().email.toLowerCase(),
      role: 'ADMIN',
    });
    expect(res.body).toHaveProperty('memberships');
  });

  it('forbids ANALYST from listing users (403)', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(403);
  });

  it('allows ANALYST to list clients (200)', async () => {
    await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);
  });

  it('lets ANALYST create a client and scopes it with a membership', async () => {
    const slug = `analyst-client-${suffix}`;
    const created = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        name: 'Analyst Client',
        slug,
      })
      .expect(201);

    const clientId = created.body.id as string;
    expect(created.body.slug).toBe(slug);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);

    expect(me.body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientId,
          clientSlug: slug,
          role: 'ANALYST',
        }),
      ]),
    );

    const mine = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);

    const ids = (mine.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toEqual([clientId]);

    const otherEmail = `analyst.other.${suffix}@norma.local`;
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: otherEmail,
        name: 'Other Analyst',
        password: analystPassword,
        role: 'ANALYST',
      })
      .expect(201);

    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: analystPassword })
      .expect(201);
    const otherToken = otherLogin.body.accessToken as string;

    await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'No deberia' })
      .expect(403);

    const otherList = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(otherList.body).toEqual([]);

    const source = await request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        name: `Fuente analyst ${suffix}`,
        code: `analyst-src-${suffix}`,
        category: 'MEDIA',
        platform: 'WEB',
        url: 'https://example.com/analyst',
        clientIds: [clientId],
      })
      .expect(201);

    const catalog = await request(app.getHttpServer())
      .get('/sources')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(
      (catalog.body as Array<{ id: string }>).some(
        (row) => row.id === source.body.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        name: `Fuente ajena ${suffix}`,
        code: `analyst-foreign-${suffix}`,
        category: 'MEDIA',
        platform: 'WEB',
        clientIds: [clientId],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/jobs/crawl')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        email: `nope.${suffix}@norma.local`,
        name: 'Nope',
        password: analystPassword,
        role: 'ANALYST',
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/clients/${clientId}/deactivate`)
      .set('Authorization', `Bearer ${analystToken}`);
    await request(app.getHttpServer())
      .patch(`/sources/${source.body.id}/deactivate`)
      .set('Authorization', `Bearer ${analystToken}`);
  });
});
