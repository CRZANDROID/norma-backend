import { DocumentProcessingStatus } from '../database/prisma-client';
import { isClassifyFailure } from '../modules/findings/progress.labels';
import { isExtractableCrawlFile, isMetaCrawlFilename } from './document-text';

export function documentNeedsExtractRetry(doc: {
  filename: string;
  mimeType: string | null;
  canonicalDocumentId: string | null;
  processingStatus: DocumentProcessingStatus;
  lastError: string | null;
}): boolean {
  if (doc.canonicalDocumentId) {
    return false;
  }
  if (
    doc.processingStatus === DocumentProcessingStatus.DEDUPED ||
    doc.processingStatus === DocumentProcessingStatus.DISCARDED
  ) {
    return false;
  }
  if (isMetaCrawlFilename(doc.filename)) {
    return false;
  }
  if (!isExtractableCrawlFile(doc.filename, doc.mimeType)) {
    return false;
  }
  if (doc.processingStatus === DocumentProcessingStatus.RECEIVED) {
    return true;
  }
  return (
    doc.processingStatus === DocumentProcessingStatus.FAILED &&
    !isClassifyFailure(doc.lastError)
  );
}

export function documentNeedsClassify(doc: {
  canonicalDocumentId: string | null;
  processingStatus: DocumentProcessingStatus;
  lastError: string | null;
  extractedText: string | null;
  findingClientIds: string[];
  linkedClientIds: string[];
}): boolean {
  if (doc.canonicalDocumentId) {
    return false;
  }
  if (
    doc.processingStatus === DocumentProcessingStatus.DEDUPED ||
    doc.processingStatus === DocumentProcessingStatus.DISCARDED
  ) {
    return false;
  }
  if (!(doc.extractedText ?? '').trim()) {
    return false;
  }
  if (doc.linkedClientIds.length === 0) {
    return false;
  }
  const missingClient = doc.linkedClientIds.some(
    (id) => !doc.findingClientIds.includes(id),
  );
  if (
    doc.processingStatus === DocumentProcessingStatus.READY_FOR_AI ||
    doc.processingStatus === DocumentProcessingStatus.CLASSIFIED
  ) {
    return missingClient;
  }
  return (
    doc.processingStatus === DocumentProcessingStatus.FAILED &&
    isClassifyFailure(doc.lastError) &&
    missingClient
  );
}
