import { crawlSite } from './site-crawl';
import type { ConnectorSource, CrawlOutcome, SourceConnector } from './types';

export class HttpPageConnector implements SourceConnector {
  constructor(
    readonly code: string,
    readonly label: string,
  ) {}

  crawl(source: ConnectorSource): Promise<CrawlOutcome> {
    return crawlSite(source);
  }
}
