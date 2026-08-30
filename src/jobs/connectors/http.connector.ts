import { crawlSite } from './site-crawl';
import type { ConnectorFetch, ConnectorSource, SourceConnector } from './types';

export class HttpPageConnector implements SourceConnector {
  constructor(
    readonly code: string,
    readonly label: string,
  ) {}

  crawl(source: ConnectorSource): Promise<ConnectorFetch[]> {
    return crawlSite(source);
  }
}
