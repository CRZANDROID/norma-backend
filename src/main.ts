// Debe ir primero para que Sentry instrumente el resto del proceso.
import './instrument';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupSwagger } from './common/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  setupSwagger(app);

  // Render (y otros PaaS) inyectan PORT; hay que escuchar en 0.0.0.0.
  const port = Number(process.env.PORT ?? config.get<string>('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
