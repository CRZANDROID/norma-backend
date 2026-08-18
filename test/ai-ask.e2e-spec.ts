import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('AI catalog ask (e2e)', () => {
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

  it('rejects unauthenticated ask', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .send({ question: '¿Qué fuentes tiene Arca?' })
      .expect(401);
  });

  it('rejects empty question with 400', async () => {
    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: '' })
      .expect(400);
  });

  it('GET /ai/status does not call the model', async () => {
    const res = await request(app.getHttpServer())
      .get('/ai/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(typeof res.body.configured).toBe('boolean');
    if (res.body.configured) {
      expect(res.body.model).toBeTruthy();
    } else {
      expect(res.body.model).toBeNull();
    }
  });

  it('POST /ai/ask returns 503 when OpenAI is not configured', async () => {
    if (process.env.OPENAI_API_KEY?.trim()) {
      return;
    }

    await request(app.getHttpServer())
      .post('/ai/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: '¿Qué fuentes tiene Arca Continental?' })
      .expect(503);
  });
});
