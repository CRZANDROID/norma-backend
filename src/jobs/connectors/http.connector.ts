import { crawlSite } from './site-crawl';
import type {
  ConnectorCrawlDeps,
  ConnectorSource,
  CrawlOutcome,
  SourceConnector,
} from './types';

export class HttpPageConnector implements SourceConnector {
  constructor(
    readonly code: string,
    readonly label: string,
  ) {}

  crawl(
    source: ConnectorSource,
    deps?: ConnectorCrawlDeps,
  ): Promise<CrawlOutcome> {
    return crawlSite(source, deps);
  }
}
