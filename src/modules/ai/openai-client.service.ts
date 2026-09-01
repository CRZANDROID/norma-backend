import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { readProjectEnvFile } from '../../config/project-env';
import { DEFAULT_OPENAI_MODEL } from './ai.constants';

@Injectable()
export class OpenAiClientService {
  private readonly logger = new Logger(OpenAiClientService.name);
  private client: OpenAI | null = null;
  private model = DEFAULT_OPENAI_MODEL;
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  status() {
    this.hydrate();
    return {
      configured: this.configured,
      model: this.configured ? this.model : null,
    };
  }

  isConfigured(): boolean {
    this.hydrate();
    return this.configured;
  }

  getModel(): string {
    this.hydrate();
    return this.model;
  }

  ensureClient(): OpenAI {
    this.hydrate();
    if (!this.configured || !this.client) {
      throw new ServiceUnavailableException(
        'OpenAI no configurado. Define OPENAI_API_KEY.',
      );
    }
    return this.client;
  }

  private hydrate() {
    if (this.client) {
      return;
    }

    const fromFile = readProjectEnvFile();
    const fromConfig = this.config.get<string>('OPENAI_API_KEY')?.trim();
    const fromProcess = process.env.OPENAI_API_KEY?.trim();
    const fromEnvFile = fromFile.OPENAI_API_KEY?.trim();
    const apiKey = fromEnvFile || fromConfig || fromProcess;
    this.model =
      fromFile.OPENAI_MODEL?.trim() ||
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      DEFAULT_OPENAI_MODEL;

    if (!apiKey) {
      this.configured = false;
      this.logger.warn(
        'OpenAI no configurado. Define OPENAI_API_KEY en el .env del backend.',
      );
      return;
    }

    this.client = new OpenAI({
      apiKey,
      timeout: 30_000,
      maxRetries: 1,
    });
    this.configured = true;
  }
}
