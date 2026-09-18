import type { Prisma } from '../../database/prisma-client';
import type { FetchedPage } from './fetch-page';

export type ConnectorSource = {
  id: string;
  code: string;
  name: string;
  url: string | null;
  searchFocus: string[];
  keywordsGuide?: string[];
  notes: string | null;
  sections: Prisma.JsonValue;
};

export type ConnectorFetch = {
  page: FetchedPage;
  filename: string;
};

export type CrawlOutcome = {
  pages: ConnectorFetch[];
  failedFetches: number;
  originUnreachable: boolean;
};

export type CrawlProgressEvent = {
  saved: number;
  maxPages: number;
  url: string;
};

export type ConnectorCrawlDeps = {
  onProgress?: (event: CrawlProgressEvent) => void;
};

export interface SourceConnector {
  code: string;
  label: string;
  crawl(
    source: ConnectorSource,
    deps?: ConnectorCrawlDeps,
  ): Promise<CrawlOutcome>;
}
