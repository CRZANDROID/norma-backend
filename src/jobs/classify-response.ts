import { ImpactLevel } from '../database/prisma-client';

const IMPACTS = new Set<string>(Object.values(ImpactLevel));

export type ClassifyLlmResult = {
  relevant: boolean;
  impact: ImpactLevel;
  title: string;
  justification: string;
};

export function parseClassifyResponse(raw: string): ClassifyLlmResult {
  const parsed = parseJsonObject(raw);
  const relevant = parsed.relevant !== false;
  const impactRaw = String(parsed.impact ?? '').toUpperCase();
  let impact = IMPACTS.has(impactRaw)
    ? (impactRaw as ImpactLevel)
    : ImpactLevel.YELLOW;
  if (!relevant) {
    impact = ImpactLevel.GREEN;
  }

  const title = String(parsed.title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const justification = normalizeJustification(
    String(parsed.justification ?? parsed.description ?? ''),
  );

  if (!title) {
    throw new Error('El modelo no devolvió un título de hallazgo.');
  }
  if (!justification) {
    throw new Error('El modelo no devolvió una justificación.');
  }

  return {
    relevant,
    impact,
    title: title || (relevant ? 'Hallazgo' : 'Sin relevancia operativa'),
    justification,
  };
}

/** Autorreporte del modelo: `none` = la indicación no se sostiene con el documento. */
export type RewriteApplied = 'full' | 'partial' | 'none';

export type RewriteLlmResult = {
  title: string;
  justification: string;
  applied: RewriteApplied;
  /** Lo que la IA no pudo hacer. Va a aiMeta, no al briefing. */
  note: string | null;
};

export function parseRewriteResponse(
  raw: string,
  noteLimit = 240,
): RewriteLlmResult {
  const parsed = parseJsonObject(raw);
  const title = String(parsed.title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const justification = normalizeJustification(
    String(parsed.justification ?? parsed.description ?? ''),
  );
  if (!title) {
    throw new Error('El modelo no devolvió un título de hallazgo.');
  }
  if (!justification) {
    throw new Error('El modelo no devolvió una justificación.');
  }
  return {
    title,
    justification,
    applied: parseApplied(parsed.applied),
    note: parseNote(parsed.note, noteLimit),
  };
}

/** Ante un valor raro asumimos `full`: el diff con el borrador decide. */
function parseApplied(value: unknown): RewriteApplied {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'none' || raw === 'ninguno' || raw === 'no') {
    return 'none';
  }
  if (raw === 'partial' || raw === 'parcial') {
    return 'partial';
  }
  return 'full';
}

function parseNote(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const note = value.replace(/\s+/g, ' ').trim();
  if (!note || note.toLowerCase() === 'null') {
    return null;
  }
  return note.slice(0, limit);
}

/** Conserva saltos de línea del briefing; aplana solo espacios en la misma línea. */
export function normalizeJustification(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('El modelo no devolvió JSON.');
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('El modelo no devolvió JSON válido.');
    }
    try {
      value = JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw new Error('El modelo no devolvió JSON válido.');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El modelo no devolvió un objeto JSON.');
  }
  return value as Record<string, unknown>;
}
