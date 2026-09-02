import { DocumentProcessingStatus } from '../../database/prisma-client';
import {
  analysisDaySignals,
  analysisProgressLabel,
  analysisProgressNote,
  emptyImpactCounts,
  isClassifyFailure,
  mapAnalysisProgressStatus,
} from './progress.labels';

describe('analysis progress labels', () => {
  it('maps pipeline + findings to executive analysis status', () => {
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [{ processingStatus: DocumentProcessingStatus.CLASSIFIED }],
          2,
        ),
      ),
    ).toBe('classified');
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [
            { processingStatus: DocumentProcessingStatus.CLASSIFIED },
            { processingStatus: DocumentProcessingStatus.READY_FOR_AI },
          ],
          2,
        ),
      ),
    ).toBe('classifying');
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [{ processingStatus: DocumentProcessingStatus.CLASSIFIED }],
          2,
          true,
        ),
      ),
    ).toBe('classifying');
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [{ processingStatus: DocumentProcessingStatus.READY_FOR_AI }],
          0,
        ),
      ),
    ).toBe('classifying');
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [
            {
              processingStatus: DocumentProcessingStatus.FAILED,
              lastError: 'Clasificación: OpenAI no configurado. Define OPENAI_API_KEY.',
            },
          ],
          0,
        ),
      ),
    ).toBe('failed');
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [{ processingStatus: DocumentProcessingStatus.CLASSIFIED }],
          0,
        ),
      ),
    ).toBe('skipped');
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [{ processingStatus: DocumentProcessingStatus.EXTRACTED }],
          0,
        ),
      ),
    ).toBe('pending');
    expect(analysisProgressLabel('classified')).toBe('Analizada');
    expect(analysisProgressLabel('classifying')).toBe('Analizando');
  });

  it('does not treat extract failures as analysis failures', () => {
    expect(
      isClassifyFailure('Extracción fallida: Storage timeout'),
    ).toBe(false);
    expect(
      mapAnalysisProgressStatus(
        analysisDaySignals(
          [
            {
              processingStatus: DocumentProcessingStatus.FAILED,
              lastError: 'Extracción fallida: Storage timeout',
            },
          ],
          0,
        ),
      ),
    ).toBe('pending');
  });

  it('builds notes without pipeline jargon', () => {
    expect(
      analysisProgressNote(
        'classifying',
        analysisDaySignals(
          [
            { processingStatus: DocumentProcessingStatus.CLASSIFIED },
            { processingStatus: DocumentProcessingStatus.READY_FOR_AI },
          ],
          1,
        ),
      ),
    ).toBe('Hay hallazgos. Sigue el análisis de otras páginas.');
    expect(
      analysisProgressNote(
        'classifying',
        analysisDaySignals(
          [{ processingStatus: DocumentProcessingStatus.CLASSIFIED }],
          1,
          true,
        ),
      ),
    ).toBe('Hay hallazgos. Sigue el rastreo; pueden llegar más páginas.');
    expect(
      analysisProgressNote('failed', analysisDaySignals([], 0)),
    ).toBe('No se pudo completar el análisis de esta fuente.');
    expect(
      analysisProgressNote('skipped', analysisDaySignals([], 0)),
    ).toBe('La fuente no tiene clientes vinculados; no hay hallazgos.');
    expect(emptyImpactCounts()).toEqual({
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
    });
  });
});
