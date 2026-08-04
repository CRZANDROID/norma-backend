import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './utils/create-e2e-app';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('database');
        expect(res.body).toHaveProperty('timestamp');
      });
  });
});
