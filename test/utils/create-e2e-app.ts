import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { AppModule } from '../../src/app.module';

loadEnv();

export async function createE2eApp(): Promise<INestApplication> {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for e2e tests (.env)');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for e2e tests (.env)');
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export function adminCredentials() {
  return {
    email: process.env.AUTH_SEED_EMAIL || 'admin@norma.local',
    password: process.env.AUTH_SEED_PASSWORD || 'ChangeMe123!',
  };
}
