import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminCredentials, createE2eApp } from './utils/create-e2e-app';

describe('Source state + client delivery (e2e)', () => {
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

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('lists seed state congresses and filters by jurisdiction', async () => {
    const all = await request(app.getHttpServer())
      .get('/sources')
      .set(auth())
      .expect(200);

    const jal = all.body.find((s: { code: string }) => s.code === 'jalisco-congreso');
    expect(jal).toMatchObject({
      jurisdiction: 'STATE',
      stateCode: 'JAL',
      status: 'ACTIVE',
      url: 'https://www.congresojal.gob.mx/',
    });
    expect(jal.searchFocus).toBeTruthy();
    expect(jal.notes).toMatch(/Alta prioridad/i);
    expect(jal.schedule).toMatchObject({
      time: '07:00',
      timezone: 'America/Mexico_City',
      weekdays: [1, 2, 3, 4, 5],
    });

    const hidalgo = all.body.find((s: { code: string }) => s.code === 'congreso-hid');
    expect(hidalgo?.url).toBe('https://congresohidalgo.gob.mx/');

    expect(
      all.body.some((s: { code: string }) => s.code === 'senado-gaceta'),
    ).toBe(true);
    expect(
      all.body.some((s: { code: string }) => s.code === 'mananera-presidencia'),
    ).toBe(true);

    const states = await request(app.getHttpServer())
      .get('/sources?jurisdiction=STATE')
      .set(auth())
      .expect(200);

    expect(states.body.length).toBeGreaterThanOrEqual(32);
    expect(
      states.body.every((s: { jurisdiction: string }) => s.jurisdiction === 'STATE'),
    ).toBe(true);

    const jalFilter = await request(app.getHttpServer())
      .get('/sources?stateCode=JAL')
      .set(auth())
      .expect(200);

    expect(jalFilter.body.some((s: { code: string }) => s.code === 'jalisco-congreso')).toBe(
      true,
    );
  });

  it('rejects STATE source without stateCode', async () => {
    await request(app.getHttpServer())
      .post('/sources')
      .set(auth())
      .send({
        name: `Congreso incompleto ${suffix}`,
        code: `bad-state-${suffix}`,
        category: 'OFFICIAL',
        platform: 'WEB',
        jurisdiction: 'STATE',
      })
      .expect(400);
  });

  it('creates a STATE source with schedule and defaults delivery on client', async () => {
    const source = await request(app.getHttpServer())
      .post('/sources')
      .set(auth())
      .send({
        name: `Congreso E2E ${suffix}`,
        code: `congreso-e2e-${suffix}`,
        category: 'OFFICIAL',
        platform: 'WEB',
        url: 'https://example.com/congreso',
        jurisdiction: 'STATE',
        stateCode: 'NLE',
        schedule: {
          time: '08:30',
          weekdays: [1, 3, 5],
        },
      })
      .expect(201);

    expect(source.body).toMatchObject({
      jurisdiction: 'STATE',
      stateCode: 'NLE',
      schedule: {
        time: '08:30',
        timezone: 'America/Mexico_City',
        weekdays: [1, 3, 5],
      },
    });

    const client = await request(app.getHttpServer())
      .post('/clients')
      .set(auth())
      .send({
        name: `Delivery E2E ${suffix}`,
        slug: `delivery-e2e-${suffix}`,
        sourceIds: [source.body.id],
      })
      .expect(201);

    expect(client.body.deliveryConfig).toMatchObject({
      emailEnabled: true,
      whatsappEnabled: false,
      schedule: { time: '07:00', weekdays: [1, 2, 3, 4, 5] },
    });
    expect(client.body.deliveryConfig.impactActions).toHaveLength(4);
    expect(client.body.deliveryConfig.impactActions[0]).toMatchObject({
      impact: 'GREEN',
      suggestedAction: 'Registrar como contexto',
    });
    expect(client.body.deliveryConfig.impactActions[3]).toMatchObject({
      impact: 'RED',
      suggestedAction: 'Alertar de inmediato y preparar nota ejecutiva',
    });

    const patched = await request(app.getHttpServer())
      .patch(`/clients/${client.body.id}/delivery`)
      .set(auth())
      .send({
        whatsappEnabled: true,
        schedule: { time: '09:00', weekdays: [1, 2, 3, 4, 5] },
      })
      .expect(200);

    expect(patched.body).toMatchObject({
      whatsappEnabled: true,
      emailEnabled: true,
      schedule: { time: '09:00' },
    });

    await request(app.getHttpServer())
      .patch(`/clients/${client.body.id}/deactivate`)
      .set(auth())
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/sources/${source.body.id}/deactivate`)
      .set(auth())
      .expect(200);
  });
});
