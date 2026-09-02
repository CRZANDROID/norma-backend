import { DocumentProcessingStatus, ImpactLevel } from '../../database/prisma-client';

export type AnalysisProgressStatus =
  | 'pending'
  | 'classifying'
  | 'classified'
  | 'failed'
  | 'skipped';

export const ANALYSIS_PROGRESS_LABELS: Record<AnalysisProgressStatus, string> = {
  pending: 'Sin análisis aún',
  classifying: 'Analizando',
  classified: 'Analizada',
  failed: 'No se pudo analizar',
  skipped: 'Sin análisis',
};

const CLASSIFY_FAIL_RE = /^Clasificación:|OpenAI no configurado/i;

export function analysisProgressLabel(status: AnalysisProgressStatus): string {
  return ANALYSIS_PROGRESS_LABELS[status];
}

export function isClassifyFailure(lastError: string | null | undefined): boolean {
  return Boolean(lastError && CLASSIFY_FAIL_RE.test(lastError));
}

export type AnalysisDaySignals = {
  hasFindings: boolean;
  hasReadyForAi: boolean;
  hasClassifiedDoc: boolean;
  hasClassifyFailed: boolean;
  crawlInFlight: boolean;
};

export function analysisDaySignals(
  docs: Array<{
    processingStatus: DocumentProcessingStatus;
    lastError?: string | null;
  }>,
  findingCount: number,
  crawlInFlight = false,
): AnalysisDaySignals {
  let hasReadyForAi = false;
  let hasClassifiedDoc = false;
  let hasClassifyFailed = false;
  for (const doc of docs) {
    if (doc.processingStatus === DocumentProcessingStatus.READY_FOR_AI) {
      hasReadyForAi = true;
    }
    if (doc.processingStatus === DocumentProcessingStatus.CLASSIFIED) {
      hasClassifiedDoc = true;
    }
    if (
      doc.processingStatus === DocumentProcessingStatus.FAILED &&
      isClassifyFailure(doc.lastError)
    ) {
      hasClassifyFailed = true;
    }
  }
  return {
    hasFindings: findingCount > 0,
    hasReadyForAi,
    hasClassifiedDoc,
    hasClassifyFailed,
    crawlInFlight,
  };
}

export function mapAnalysisProgressStatus(
  signals: AnalysisDaySignals,
): AnalysisProgressStatus {
  if (signals.hasReadyForAi) {
    return 'classifying';
  }
  if (
    signals.crawlInFlight &&
    (signals.hasFindings || signals.hasClassifiedDoc || signals.hasClassifyFailed)
  ) {
    return 'classifying';
  }
  if (signals.hasFindings) {
    return 'classified';
  }
  if (signals.hasClassifyFailed) {
    return 'failed';
  }
  if (signals.hasClassifiedDoc) {
    return 'skipped';
  }
  return 'pending';
}

export function analysisProgressNote(
  status: AnalysisProgressStatus,
  signals: AnalysisDaySignals,
): string | null {
  if (status === 'classifying' && signals.hasFindings) {
    if (signals.crawlInFlight && !signals.hasReadyForAi) {
      return 'Hay hallazgos. Sigue el rastreo; pueden llegar más páginas.';
    }
    return 'Hay hallazgos. Sigue el análisis de otras páginas.';
  }
  if (status === 'classified' && signals.hasClassifyFailed) {
    return 'Hay hallazgos. Otro documento de hoy no se pudo analizar.';
  }
  if (status === 'failed') {
    return 'No se pudo completar el análisis de esta fuente.';
  }
  if (status === 'skipped') {
    return 'La fuente no tiene clientes vinculados; no hay hallazgos.';
  }
  return null;
}

export function emptyImpactCounts(): Record<'red' | 'orange' | 'yellow' | 'green', number> {
  return { red: 0, orange: 0, yellow: 0, green: 0 };
}

export function addImpactCount(
  counts: ReturnType<typeof emptyImpactCounts>,
  impact: ImpactLevel,
): void {
  if (impact === ImpactLevel.RED) {
    counts.red += 1;
  } else if (impact === ImpactLevel.ORANGE) {
    counts.orange += 1;
  } else if (impact === ImpactLevel.YELLOW) {
    counts.yellow += 1;
  } else {
    counts.green += 1;
  }
}

