import * as Sentry from '@sentry/nestjs';
import { applyProjectEnvToProcess } from './config/project-env';

// Cargar .env antes de init (ConfigModule de Nest aún no está listo).
applyProjectEnvToProcess();

const dsn = process.env.SENTRY_DSN?.trim();
const enabled = Boolean(dsn);

Sentry.init({
  dsn: dsn || undefined,
  enabled,
  environment: process.env.NODE_ENV ?? 'development',
  // En desarrollo capturamos todo; en prod ajustar según volumen.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  sendDefaultPii: false,
});

// Sin secretos: solo confirma si el SDK arrancó con DSN.
// eslint-disable-next-line no-console
console.log(`[Sentry] enabled=${enabled} env=${process.env.NODE_ENV ?? 'development'}`);
