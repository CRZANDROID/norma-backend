import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('NORMA API')
    .setDescription(
      'API administrativa NORMA — auth JWT propia, clients, profiles, sources, users y storage.',
    )
    .setVersion('0.4.0')
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
    .addTag('sources', 'Catálogo de fuentes')
    .addTag('users', 'Admin de usuarios')
    .addTag('memberships', 'Membresías usuario↔cliente')
    .addTag('storage', 'Supabase Storage (archivos)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
