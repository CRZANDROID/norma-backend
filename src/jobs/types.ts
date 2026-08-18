export const SOURCE_CRAWL_QUEUE = 'source.crawl';

export type CrawlTriggeredBy = 'scheduler' | 'admin' | 'retry';

export type JobErrorCodeName =
  | 'NETWORK'
  | 'PARSE'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'UNKNOWN';

export type SourceCrawlJob = {
  jobId: string;
  type: 'source.crawl';
  sourceId: string;
  sourceCode: string;
  enqueuedAt: string;
  since?: string;
  until?: string;
  idempotencyKey: string;
  triggeredBy: CrawlTriggeredBy;
  requestedByUserId?: string;
};

export type SourceCrawlArtifact = {
  storagePath: string;
  contentType?: string;
  byteSize?: number;
  documentId?: string;
  externalRef?: string;
};

export type SourceCrawlResult = {
  ok: true;
  jobId: string;
  sourceId: string;
  artifacts: SourceCrawlArtifact[];
  stats: {
    fetched: number;
    saved: number;
    skipped: number;
  };
  finishedAt: string;
};

export type SourceCrawlFailure = {
  ok: false;
  jobId: string;
  sourceId: string;
  errorCode: JobErrorCodeName;
  message: string;
  retryable: boolean;
  finishedAt: string;
};

export class CrawlError extends Error {
  constructor(
    message: string,
    readonly errorCode: JobErrorCodeName,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'CrawlError';
  }
}
