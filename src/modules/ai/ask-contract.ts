import {
  ASK_HISTORY_LIMIT,
  CATALOG_BLOCK_MARKER,
  NORMA_SYSTEM_PROMPT,
} from './ai.constants';

export type AskRole = 'user' | 'assistant';

export type AskTurn = {
  role: AskRole;
  content: string;
};

export type AskDraftTarget = 'profile' | 'source';

export type ProfileDraft = {
  name: string;
  description?: string;
  keywords?: string[];
  categories?: string[];
  products?: string[];
};

export type SourceDraft = {
  keywordsGuide?: string[];
  searchFocus?: string[];
};

export type AskDraft =
  | { target: 'profile'; profile: ProfileDraft }
  | { target: 'source'; source: SourceDraft };

type ChatMessage = {
  role: 'system' | AskRole;
  content: string;
};

const SHORT_TEXT = 200;
const DESCRIPTION_TEXT = 2000;
const LIST_CAP = 40;
const PAGE_TEXT_CAP = 12_000;
const MIN_PAGE_TEXT = 40;

export function trimAskHistory(messages: AskTurn[] | undefined): AskTurn[] {
  if (!messages?.length) return [];
  return messages.slice(-ASK_HISTORY_LIMIT);
}

export function htmlToVisibleText(html: string): string {
  const text = decodeHtml(stripTags(dropHidden(html)))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PAGE_TEXT_CAP);
  return text.length >= MIN_PAGE_TEXT ? text : '';
}

export function isHtmlContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('html');
}

export function httpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function parseModelPayload(raw: string): {
  answer: string;
  draft: unknown;
} {
  let json = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(json);
  if (fence?.[1]) json = fence[1].trim();
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('not-an-object');
  }
  const answer = (parsed as { answer?: unknown }).answer;
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('empty-answer');
  }
  return {
    answer: answer.trim(),
    draft: (parsed as { draft?: unknown }).draft ?? null,
  };
}

export function sanitizeAskDraft(
  raw: unknown,
  input: {
    draftTarget: AskDraftTarget | null;
    companyName?: string;
    writtenDescription?: string;
    evidenceText?: string;
  },
): AskDraft | null {
  if (!input.draftTarget) return null;
  if (input.draftTarget === 'profile') {
    return sanitizeProfile(raw, input);
  }
  return sanitizeSource(raw, input.evidenceText ?? '');
}

export function buildAskMessages(input: {
  catalog: unknown;
  history: AskTurn[];
  question: string;
  draftTarget: AskDraftTarget | null;
  evidence?: string;
  companyName?: string;
  writtenDescription?: string;
  sourceUrl?: string;
}): ChatMessage[] {
  const history = trimAskHistory(input.history);
  const messages: ChatMessage[] = [
    { role: 'system', content: NORMA_SYSTEM_PROMPT },
    { role: 'system', content: jsonInstruction(input.draftTarget) },
    {
      role: 'system',
      content: `${CATALOG_BLOCK_MARKER}\n${JSON.stringify(input.catalog)}`,
    },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];
  if (input.evidence?.trim()) {
    messages.push({ role: 'user', content: input.evidence.trim() });
  }
  messages.push({
    role: 'user',
    content: finalQuestion(input),
  });
  return messages;
}

function jsonInstruction(draftTarget: AskDraftTarget | null): string {
  if (draftTarget === 'profile') {
    return `Responde solo con un objeto JSON {"answer":"...","draft":{"target":"profile","profile":{"description":"","keywords":[],"categories":[],"products":[]}}} o {"answer":"...","draft":null}.
answer es la prosa en español. No digas que guardaste ni que lanzaste un rastreo.
No pongas name: el servidor copia el nombre que escribió la persona.
keywords, categories y products solo si esas palabras están en los resultados de búsqueda de este mensaje. Si no están, deja el arreglo vacío. No uses el catálogo ni tu memoria.
Si la persona ya escribió una descripción, omite description. Si la dejó vacía, proponla solo cuando los fragmentos la sostengan.
Sin resultados que nombren la empresa, draft es null.`;
  }
  if (draftTarget === 'source') {
    return `Responde solo con un objeto JSON {"answer":"...","draft":{"target":"source","source":{"keywordsGuide":[],"searchFocus":[]}}} o {"answer":"...","draft":null}.
answer es la prosa en español. No digas que guardaste ni que lanzaste un rastreo.
keywordsGuide y searchFocus salen solo del texto de la página de este mensaje, en materia sanitaria. No uses el giro del cliente ni el catálogo para rellenarlos.
No incluyas nombre, URL, horario, notas ni clientes. Si el texto no alcanza, draft es null.`;
  }
  return `Responde solo con un objeto JSON {"answer":"...","draft":null}.
answer es la prosa en español. draft es null. No digas que guardaste ni que lanzaste un rastreo.`;
}

function finalQuestion(input: {
  question: string;
  draftTarget: AskDraftTarget | null;
  companyName?: string;
  writtenDescription?: string;
  sourceUrl?: string;
}): string {
  const lines = [input.question.trim()];
  if (input.draftTarget === 'profile' && input.companyName?.trim()) {
    lines.push(`Empresa: ${input.companyName.trim()}`);
    if (input.writtenDescription?.trim()) {
      lines.push(
        `Descripción que escribió la persona: ${input.writtenDescription.trim()}`,
      );
    }
  }
  if (input.draftTarget === 'source' && input.sourceUrl?.trim()) {
    lines.push(`URL de la fuente nueva: ${input.sourceUrl.trim()}`);
  }
  return lines.join('\n');
}

function sanitizeProfile(
  raw: unknown,
  input: {
    companyName?: string;
    writtenDescription?: string;
    evidenceText?: string;
  },
): AskDraft | null {
  const name = cleanShort(input.companyName);
  if (!name) return null;
  const record = draftRecord(raw, 'profile', 'profile');
  const evidence = input.evidenceText ?? '';
  const written = cleanDescription(input.writtenDescription);
  const modelDescription = cleanDescription(record?.description);
  const description =
    written ??
    (modelDescription && supported(modelDescription, evidence)
      ? modelDescription
      : null);
  const keywords = supportedList(record?.keywords, evidence);
  const categories = supportedList(record?.categories, evidence);
  const products = supportedList(record?.products, evidence);
  const profile: ProfileDraft = { name };
  if (description) profile.description = description;
  if (keywords.length) profile.keywords = keywords;
  if (categories.length) profile.categories = categories;
  if (products.length) profile.products = products;
  return { target: 'profile', profile };
}

function sanitizeSource(raw: unknown, evidence: string): AskDraft | null {
  const record = draftRecord(raw, 'source', 'source');
  const keywordsGuide = supportedList(record?.keywordsGuide, evidence);
  const searchFocus = supportedList(record?.searchFocus, evidence);
  if (!keywordsGuide.length && !searchFocus.length) return null;
  const source: SourceDraft = {};
  if (keywordsGuide.length) source.keywordsGuide = keywordsGuide;
  if (searchFocus.length) source.searchFocus = searchFocus;
  return { target: 'source', source };
}

function draftRecord(
  raw: unknown,
  target: AskDraftTarget,
  key: 'profile' | 'source',
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as { target?: unknown; profile?: unknown; source?: unknown };
  if (body.target !== target) return null;
  const nested = body[key];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested))
    return null;
  return nested as Record<string, unknown>;
}

function supportedList(value: unknown, evidence: string): string[] {
  return cleanList(value).filter((item) => supported(item, evidence));
}

function supported(item: string, evidence: string): boolean {
  const foldedItem = fold(item);
  const foldedEvidence = fold(evidence);
  if (!foldedItem || !foldedEvidence) return false;
  if (foldedItem.length >= 3 && foldedEvidence.includes(foldedItem))
    return true;
  const words = foldedItem
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);
  return (
    words.length > 0 && words.every((word) => foldedEvidence.includes(word))
  );
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const clean = cleanShort(item);
    if (!clean) continue;
    out.push(clean);
    if (out.length >= LIST_CAP) break;
  }
  return out;
}

function cleanShort(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SHORT_TEXT);
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, DESCRIPTION_TEXT);
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function dropHidden(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}
