export const DOCUMENT_EXTRACT_QUEUE = 'document.extract';
export const DOCUMENT_NORMALIZE_QUEUE = 'document.normalize_dedup';

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
