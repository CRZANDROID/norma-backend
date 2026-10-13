import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APIError, type OpenAI } from 'openai';
import { fetchPage } from '../../jobs/connectors/fetch-page';
import type { AuthUser } from '../auth/auth.types';
import { CHAT_TEMPERATURE } from './ai.constants';
import {
  buildAskMessages,
  htmlToVisibleText,
  httpUrl,
  isHtmlContentType,
  parseModelPayload,
  sanitizeAskDraft,
  trimAskHistory,
  withoutSaveReminder,
  type AskDraft,
  type AskDraftTarget,
} from './ask-contract';
import { CatalogContextService } from './catalog-context.service';
import type { AskAiDto } from './dto/ask-ai.dto';
import { OpenAiClientService } from './openai-client.service';
import { ProfileWebSearchService } from './profile-web-search.service';
import { evidenceFromHits } from './public-web-search';

const NO_COMPANY =
  'No encontré esa empresa en la búsqueda pública, así que no dejé un borrador.';
const NO_SOURCE_URL =
  'No hay una URL http(s) en el alta de la fuente, así que no descargué la página ni dejé un borrador.';
const PAGE_UNREADABLE =
  'No pude leer esa página, así que no dejé palabras guía ni enfoque.';
const PAGE_NOT_HTML =
  'Esa página no trae texto HTML, así que no dejé palabras guía ni enfoque.';
const EMPTY_MODEL = 'El modelo no devolvió una respuesta. Intenta de nuevo.';

@Injectable()
export class AiService {
  constructor(
    private readonly openaiClient: OpenAiClientService,
    private readonly catalogContext: CatalogContextService,
    private readonly webSearch: ProfileWebSearchService,
  ) {}

  status() {
    return this.openaiClient.status();
  }

  async ask(user: AuthUser, dto: AskAiDto) {
    const draftTarget = dto.draftTarget ?? null;
    if (draftTarget === 'profile' && !dto.profileSeed?.companyName?.trim()) {
      throw new BadRequestException(
        'Para el borrador de perfil hace falta el nombre de la empresa.',
      );
    }
    const openai = this.openaiClient.ensureClient();
    const { catalog, stats } = await this.catalogContext.build(
      user,
      dto.clientId,
    );
    const history = trimAskHistory(dto.messages);
    const model = this.openaiClient.getModel();

    if (draftTarget === 'profile') {
      const companyName = dto.profileSeed?.companyName?.trim() ?? '';
      const writtenDescription =
        dto.profileSeed?.description?.trim() || undefined;
      const search = await this.webSearch.search(
        companyName,
        writtenDescription,
      );
      if (!search.configured || search.results.length === 0) {
        return this.reply(NO_COMPANY, model, stats);
      }
      const evidenceText = evidenceFromHits(search.results);
      const parsed = await this.complete(openai, {
        catalog,
        history,
        question: dto.question,
        draftTarget,
        screen: dto.screen,
        evidence: `Resultados de la búsqueda pública de este turno:\n${evidenceText}`,
        companyName,
        writtenDescription,
        evidenceText,
      });
      return {
        answer: parsed.answer,
        model: parsed.model,
        catalog: stats,
        draft: parsed.draft,
      };
    }

    if (draftTarget === 'source') {
      const sourceUrl = httpUrl(dto.sourceUrl);
      if (!sourceUrl) {
        return this.reply(NO_SOURCE_URL, model, stats);
      }
      const page = await this.readSourcePage(sourceUrl);
      if (page.kind !== 'html') {
        return this.reply(
          page.kind === 'unread' ? PAGE_UNREADABLE : PAGE_NOT_HTML,
          model,
          stats,
        );
      }
      const parsed = await this.complete(openai, {
        catalog,
        history,
        question: dto.question,
        draftTarget,
        screen: dto.screen,
        evidence: `Texto visible de la página de este turno:\n${page.text}`,
        sourceUrl,
        evidenceText: page.text,
      });
      return {
        answer: parsed.answer,
        model: parsed.model,
        catalog: stats,
        draft: parsed.draft,
      };
    }

    const parsed = await this.complete(openai, {
      catalog,
      history,
      question: dto.question,
      draftTarget: null,
      screen: dto.screen,
    });
    return {
      answer: parsed.answer,
      model: parsed.model,
      catalog: stats,
      draft: null,
    };
  }

  private reply(
    answer: string,
    model: string,
    stats: {
      clientCount: number;
      profileCount: number;
      sourceCount: number;
      scopedToClientId: string | null;
    },
  ) {
    return { answer, model, catalog: stats, draft: null as AskDraft | null };
  }

  /** Una página, con el timeout y el tope de bytes de fetchPage. No sigue enlaces ni encola rastreo. */
  private async readSourcePage(
    url: string,
  ): Promise<{ kind: 'html'; text: string } | { kind: 'unread' | 'not-html' }> {
    try {
      const page = await fetchPage(url);
      if (!isHtmlContentType(page.contentType)) return { kind: 'not-html' };
      const text = htmlToVisibleText(page.body.toString('utf8'));
      if (!text) return { kind: 'not-html' };
      return { kind: 'html', text };
    } catch {
      return { kind: 'unread' };
    }
  }

  private async complete(
    openai: OpenAI,
    input: {
      catalog: unknown;
      history: ReturnType<typeof trimAskHistory>;
      question: string;
      draftTarget: AskDraftTarget | null;
      screen?: AskAiDto['screen'];
      evidence?: string;
      evidenceText?: string;
      companyName?: string;
      writtenDescription?: string;
      sourceUrl?: string;
    },
  ): Promise<{ answer: string; model: string; draft: AskDraft | null }> {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: this.openaiClient.getModel(),
        temperature: CHAT_TEMPERATURE,
        response_format: { type: 'json_object' },
        messages: buildAskMessages({
          catalog: input.catalog,
          history: input.history,
          question: input.question,
          draftTarget: input.draftTarget,
          screen: input.screen,
          evidence: input.evidence,
          companyName: input.companyName,
          writtenDescription: input.writtenDescription,
          sourceUrl: input.sourceUrl,
        }),
      });
    } catch (error) {
      this.rethrowOpenAi(error);
    }

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new InternalServerErrorException(EMPTY_MODEL);
    }
    let parsed: { answer: string; draft: unknown };
    try {
      parsed = parseModelPayload(raw);
    } catch {
      throw new InternalServerErrorException(EMPTY_MODEL);
    }
    const draft = sanitizeAskDraft(parsed.draft, {
      draftTarget: input.draftTarget,
      companyName: input.companyName,
      writtenDescription: input.writtenDescription,
      evidenceText: input.evidenceText,
    });
    const answer = draft ? parsed.answer : withoutSaveReminder(parsed.answer);
    return {
      answer: answer || parsed.answer,
      model: completion.model ?? this.openaiClient.getModel(),
      draft,
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
