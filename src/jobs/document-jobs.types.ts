export const DOCUMENT_EXTRACT_QUEUE = 'document.extract';
export const DOCUMENT_NORMALIZE_QUEUE = 'document.normalize_dedup';
export const DOCUMENT_CLASSIFY_QUEUE = 'document.classify';

export type DocumentExtractJob = {
  type: 'document.extract';
  jobId: string;
  documentId: string;
  storagePath: string;
  idempotencyKey: string;
  jobRunId?: string;
};

export type DocumentNormalizeJob = {
  type: 'document.normalize_dedup';
  jobId: string;
  documentId: string;
  idempotencyKey: string;
};

export type DocumentClassifyJob = {
  type: 'document.classify';
  jobId: string;
  documentId: string;
  idempotencyKey: string;
};
