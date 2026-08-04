import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('Client fiscal + contacts (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  const suffix = Date.now();

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

  it('creates/updates client with nested fiscal + contacts', async () => {
    const created = await request(app.getHttpServer())
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Fiscal E2E ${suffix}`,
        slug: `fiscal-e2e-${suffix}`,
        fiscal: {
          legalName: 'Fiscal E2E SA de CV',
          rfc: 'FEE010101AA1',
          postalCode: '01000',
          cfdi: 'G03',
          taxRegime: '601',
        },
        contacts: [
          {
            name: 'Contacto Uno',
            phone: '+528111111111',
            email: `one.${suffix}@norma.local`,
          },
          {
            name: 'Contacto Dos',
            phone: '+528122222222',
          },
        ],
      })
      .expect(201);

    expect(created.body.fiscalData).toMatchObject({
      legalName: 'Fiscal E2E SA de CV',
      rfc: 'FEE010101AA1',
      postalCode: '01000',
      cfdi: 'G03',
      taxRegime: '601',
    });
    expect(created.body.contacts).toHaveLength(2);

    const clientId = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fiscal: {
          legalName: 'Fiscal E2E Actualizado SA',
          rfc: 'FEE010101AA1',
          postalCode: '06600',
          cfdi: 'G01',
          taxRegime: '603',
        },
        contacts: [
          {
            name: 'Contacto Solo',
            phone: '+528133333333',
            email: `solo.${suffix}@norma.local`,
          },
        ],
      })
      .expect(200);

    expect(patched.body.fiscalData).toMatchObject({
      postalCode: '06600',
      cfdi: 'G01',
      taxRegime: '603',
    });
    expect(patched.body.contacts).toHaveLength(1);
    expect(patched.body.contacts[0].name).toBe('Contacto Solo');

    const list = await request(app.getHttpServer())
      .get(`/clients/${clientId}/contacts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Contacto Solo');

    await request(app.getHttpServer())
      .patch(`/contacts/${list.body[0].id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('INACTIVE');
      });
  });
});
