import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APIError } from 'openai';
import type { AuthUser } from '../auth/auth.types';
import { CATALOG_SYSTEM_PROMPT } from './ai.constants';
import { CatalogContextService } from './catalog-context.service';
import type { AskAiDto } from './dto/ask-ai.dto';
import { OpenAiClientService } from './openai-client.service';

@Injectable()
export class AiService {
  constructor(
    private readonly openaiClient: OpenAiClientService,
    private readonly catalogContext: CatalogContextService,
  ) {}

  status() {
    return this.openaiClient.status();
  }

  async ask(user: AuthUser, dto: AskAiDto) {
    const openai = this.openaiClient.ensureClient();
    const { catalog, stats } = await this.catalogContext.build(
      user,
      dto.clientId,
    );

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: this.openaiClient.getModel(),
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
      model: completion.model ?? this.openaiClient.getModel(),
      catalog: stats,
    };
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
