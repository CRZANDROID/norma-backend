import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('NORMA API')
    .setDescription(
      'API administrativa NORMA — auth JWT propia, clients, profiles, sources, users, storage, entrega/semáforo, asistente de catálogo, jobs de crawl, registro documental y hallazgos.',
    )
    .setVersion('0.7.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token de POST /auth/login',
      },
      'bearer',
    )
    .addTag('health', 'Salud del servicio')
    .addTag('auth', 'Login y perfil')
    .addTag('clients', 'Clientes y multi-tenant')
    .addTag('profiles', 'Perfiles regulatorios')
    .addTag('contacts', 'Contactos directos de clientes')
    .addTag('delivery', 'Canales de entrega y semáforo por cliente')
    .addTag('sources', 'Catálogo de fuentes')
    .addTag('users', 'Admin de usuarios')
    .addTag('memberships', 'Membresías usuario↔cliente')
    .addTag('storage', 'Supabase Storage (archivos)')
    .addTag('ai', 'Asistente de catálogo (OpenAI; no clasifica normas)')
    .addTag('jobs', 'Crawl de fuentes (Redis/BullMQ)')
    .addTag('documents', 'Registro documental (extract / normalize / dedup / classify)')
    .addTag('findings', 'Hallazgos clasificados (semáforo; sin inbox)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
