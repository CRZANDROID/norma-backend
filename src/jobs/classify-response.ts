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
  const justification = String(
    parsed.justification ?? parsed.description ?? '',
  )
    .replace(/\s+/g, ' ')
    .trim();

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
