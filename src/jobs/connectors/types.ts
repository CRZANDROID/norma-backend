import type { Prisma } from '../../database/prisma-client';
import type { FetchedPage } from './fetch-page';

export type ConnectorSource = {
  id: string;
  code: string;
  name: string;
  url: string | null;
  searchFocus: string[];
  notes: string | null;
  sections: Prisma.JsonValue;
};

export type ConnectorFetch = {
  page: FetchedPage;
  filename: string;
};

export interface SourceConnector {
  code: string;
  label: string;
  crawl(source: ConnectorSource): Promise<ConnectorFetch>;
}
