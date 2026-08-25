import { DocumentProcessingStatus } from '../../database/prisma-client';
import {
  documentDaySignals,
  documentHeadline,
  documentPipelineRank,
  documentProgressNote,
  mapDocumentPipelineStatus,
  preferHtmlFilename,
} from './progress.labels';

describe('document progress labels', () => {
  it('maps pipeline states to executive status', () => {
    expect(
      mapDocumentPipelineStatus(DocumentProcessingStatus.READY_FOR_AI),
    ).toBe('ready');
    expect(mapDocumentPipelineStatus(DocumentProcessingStatus.DEDUPED)).toBe(
      'unchanged',
    );
    expect(mapDocumentPipelineStatus(DocumentProcessingStatus.RECEIVED)).toBe(
      'extracting',
    );
    expect(mapDocumentPipelineStatus(DocumentProcessingStatus.HASHED)).toBe(
      'extracting',
    );
    expect(
      mapDocumentPipelineStatus(
        DocumentProcessingStatus.FAILED,
        'Texto extraído por debajo del umbral (41 < 80 caracteres).',
      ),
    ).toBe('unread');
    expect(
      mapDocumentPipelineStatus(
        DocumentProcessingStatus.FAILED,
        'La página parece un captcha o intersticial; no hay texto documental extraíble.',
      ),
    ).toBe('unread');
    expect(
      mapDocumentPipelineStatus(
        DocumentProcessingStatus.FAILED,
        'Extracción fallida: Storage timeout',
      ),
    ).toBe('failed');
  });

  it('builds executive notes and headlines without HTML', () => {
    expect(documentProgressNote('unread', 'umbral')).toBe(
      'La página no trajo contenido suficiente para registrar.',
    );
    expect(documentProgressNote('unread', 'captcha')).toBe(
      'La página pidió verificación y no trajo texto usable.',
    );
    expect(documentProgressNote('failed', 'boom')).toBe(
      'No se pudo extraer el texto.',
    );
    expect(documentProgressNote('ready', null)).toBeNull();
    expect(documentProgressNote('unchanged', null)).toBe(
      'El contenido es el mismo que ya teníamos registrado.',
    );
    expect(
      documentProgressNote('unchanged', null, {
        hadUnchanged: true,
        hadUnread: true,
        hadFailed: false,
      }),
    ).toBe(
      'El contenido es el mismo que ya teníamos. Otro intento de hoy no trajo texto usable.',
    );
    expect(
      documentProgressNote('ready', null, {
        hadUnchanged: true,
        hadUnread: false,
        hadFailed: true,
      }),
    ).toBe('Hay texto listo. Otro intento de hoy no se pudo extraer.');
    expect(
      documentDaySignals([
        {
          processingStatus: DocumentProcessingStatus.DEDUPED,
        },
        {
          processingStatus: DocumentProcessingStatus.FAILED,
          lastError: 'Texto extraído por debajo del umbral (10 < 80 caracteres).',
        },
      ]),
    ).toEqual({
      hadUnchanged: true,
      hadUnread: true,
      hadFailed: false,
    });
    expect(documentHeadline('  DOF - Diario Oficial\n  Decreto  ')).toBe(
      'DOF - Diario Oficial Decreto',
    );
    expect(documentHeadline('<html>no</html>'.repeat(20))?.length).toBeLessThanOrEqual(
      80,
    );
  });

  it('ranks canonical HTML over DEDUPED extras', () => {
    expect(
      documentPipelineRank(DocumentProcessingStatus.READY_FOR_AI),
    ).toBeGreaterThan(
      documentPipelineRank(DocumentProcessingStatus.DEDUPED),
    );
    expect(preferHtmlFilename('page.html')).toBeGreaterThan(
      preferHtmlFilename('extra.pdf'),
    );
  });
});
