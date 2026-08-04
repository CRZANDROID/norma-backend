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

  it('forbids ANALYST from creating clients (403)', async () => {
    await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        name: 'Should Fail',
        slug: `should-fail-${suffix}`,
      })
      .expect(403);
  });
});
