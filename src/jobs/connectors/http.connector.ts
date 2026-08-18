import { CrawlError } from '../types';
import { fetchPage, pageFilename } from './fetch-page';
import type { ConnectorFetch, ConnectorSource, SourceConnector } from './types';

export class HttpPageConnector implements SourceConnector {
  constructor(
    readonly code: string,
    readonly label: string,
  ) {}

  async crawl(source: ConnectorSource): Promise<ConnectorFetch> {
    const url = source.url?.trim();
    if (!url) {
      throw new CrawlError(
        `La fuente ${source.code} no tiene URL`,
        'PARSE',
        false,
      );
    }

    const page = await fetchPage(url);
    return {
      page,
      filename: pageFilename(page.contentType),
    };
  }
}
