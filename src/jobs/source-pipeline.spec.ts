import { DocumentProcessingStatus } from '../database/prisma-client';
import {
  documentNeedsClassify,
  documentNeedsExtractRetry,
} from './source-pipeline';

describe('source-pipeline', () => {
  const linked = ['client-a'];

  it('retries extract on RECEIVED and extract FAILED, not on CLASSIFIED', () => {
    expect(
      documentNeedsExtractRetry({
        filename: 'page.html',
        mimeType: 'text/html',
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.RECEIVED,
        lastError: null,
      }),
    ).toBe(true);
    expect(
      documentNeedsExtractRetry({
        filename: 'gaceta.pdf',
        mimeType: 'application/pdf',
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.FAILED,
        lastError: 'PDF escaneado',
      }),
    ).toBe(true);
    expect(
      documentNeedsExtractRetry({
        filename: 'page.html',
        mimeType: 'text/html',
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        lastError: null,
      }),
    ).toBe(false);
    expect(
      documentNeedsExtractRetry({
        filename: 'page.html',
        mimeType: 'text/html',
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.FAILED,
        lastError: 'Clasificación: OpenAI 429',
      }),
    ).toBe(false);
  });

  it('does not classify when the source has no clients', () => {
    expect(
      documentNeedsClassify({
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        lastError: null,
        extractedText: 'decreto',
        findingClientIds: [],
        linkedClientIds: [],
      }),
    ).toBe(false);
  });

  it('classifies CLASSIFIED docs skipped for lack of clients once a client is linked', () => {
    expect(
      documentNeedsClassify({
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        lastError: null,
        extractedText: 'decreto',
        findingClientIds: [],
        linkedClientIds: linked,
      }),
    ).toBe(true);
  });

  it('skips classify when every linked client already has a finding', () => {
    expect(
      documentNeedsClassify({
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        lastError: null,
        extractedText: 'decreto',
        findingClientIds: linked,
        linkedClientIds: linked,
      }),
    ).toBe(false);
  });

  it('classifies when a newly linked client is missing a finding', () => {
    expect(
      documentNeedsClassify({
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        lastError: null,
        extractedText: 'decreto',
        findingClientIds: ['client-a'],
        linkedClientIds: ['client-a', 'client-b'],
      }),
    ).toBe(true);
  });

  it('skips classify when the opening dateline is before 2026', () => {
    expect(
      documentNeedsClassify({
        canonicalDocumentId: null,
        processingStatus: DocumentProcessingStatus.READY_FOR_AI,
        lastError: null,
        extractedText:
          'Ciudad de México, a 23 de febrero de 2022 ALERTA SANITARIA Abbott',
        findingClientIds: [],
        linkedClientIds: linked,
        url: 'https://www.gob.mx/cms/uploads/attachment/file/1/x.pdf',
        filename: 'x.pdf',
      }),
    ).toBe(false);
  });
});
