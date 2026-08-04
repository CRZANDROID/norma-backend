import {
  Controller,
  Get,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as Sentry from '@sentry/nestjs';

/**
 * Solo para verificar Sentry en development/staging.
 * No disponible cuando NODE_ENV=production.
 */
@ApiTags('health')
@ApiExcludeController()
@Controller('debug')
export class DebugController {
  constructor(private readonly config: ConfigService) {}

  /**
   * Captura + flush explícitos (más fiable para verificar el dashboard
   * que solo lanzar y depender del filtro async).
   */
  @Get('sentry-test')
  @ApiOperation({ summary: 'Envía un error de prueba a Sentry (no-prod)' })
  async sentryTest(): Promise<{
    ok: boolean;
    sentryEnabled: boolean;
    flushed: boolean;
    ingestHost: string | null;
  }> {
    const env = this.config.get<string>('NODE_ENV', 'development');
    if (env === 'production') {
      throw new NotFoundException();
    }

    const client = Sentry.getClient();
    const dsn = client?.getDsn();
    const sentryEnabled = Boolean(dsn);

    Sentry.captureException(
      new Error('NORMA Sentry test error — safe to ignore'),
    );
    const flushed = await Sentry.flush(5000);

    return {
      ok: sentryEnabled && flushed,
      sentryEnabled,
      flushed,
      ingestHost: dsn?.host ?? null,
    };
  }
}
