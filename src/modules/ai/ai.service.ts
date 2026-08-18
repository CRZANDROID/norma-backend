import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError } from 'openai';
import type { AuthUser } from '../auth/auth.types';
import { CATALOG_SYSTEM_PROMPT, DEFAULT_OPENAI_MODEL } from './ai.constants';
import { CatalogContextService } from './catalog-context.service';
import type { AskAiDto } from './dto/ask-ai.dto';

@Injectable()
export class AiService implements OnModuleInit {
  private client: OpenAI | null = null;
  private model = DEFAULT_OPENAI_MODEL;
  private configured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly catalogContext: CatalogContextService,
  ) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    this.model =
      this.config.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL;

    if (!apiKey) {
      this.configured = false;
      return;
    }

    this.client = new OpenAI({
      apiKey,
      timeout: 30_000,
      maxRetries: 1,
    });
    this.configured = true;
  }

  status() {
    return {
      configured: this.configured,
      model: this.configured ? this.model : null,
    };
  }

  async ask(user: AuthUser, dto: AskAiDto) {
    const openai = this.ensureClient();
    const { catalog, stats } = await this.catalogContext.build(
      user,
      dto.clientId,
    );

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: CATALOG_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Catálogo registrado:\n${JSON.stringify(catalog)}\n\nPregunta del consultor:\n${dto.question.trim()}`,
          },
        ],
      });
    } catch (error) {
      this.rethrowOpenAi(error);
    }

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new InternalServerErrorException(
        'El modelo no devolvió una respuesta. Intenta de nuevo.',
      );
    }

    return {
      answer,
      model: completion.model ?? this.model,
      catalog: stats,
    };
  }

  private ensureClient(): OpenAI {
    if (!this.configured || !this.client) {
      throw new ServiceUnavailableException(
        'OpenAI no configurado. Define OPENAI_API_KEY.',
      );
    }
    return this.client;
  }

  private rethrowOpenAi(error: unknown): never {
    if (error instanceof APIError) {
      const retryable = error.status === 429 || (error.status ?? 0) >= 500;
      throw new ServiceUnavailableException(
        retryable
          ? 'OpenAI no disponible por ahora. Intenta de nuevo.'
          : 'OpenAI rechazó la solicitud. Revisa el modelo o la API key.',
      );
    }
    throw new ServiceUnavailableException(
      'No se pudo contactar a OpenAI. Intenta de nuevo.',
    );
  }
}
